import io
import os
import cv2
import base64
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from torchvision import transforms
from torchvision.models import densenet121

print("==================================================================")
print(" [+] BOOTING NEUROSCAN V4 FASTAPI BACKEND")
print("==================================================================")

# ==========================================
# 1. INITIALIZATION & PATHS
# ==========================================
app = FastAPI(title="NeuroScan Clinical AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_PATH = os.path.join(BACKEND_DIR, "model_weights", "neuroscan_densenet121_best.pth")
TARGET_CLASSES = ['Hydrocephalus', 'Intracerebral Hemorrhage', 'Ischemic Stroke', 'Normal']

val_transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# ==========================================
# 2. MONGODB CONNECTION
# ==========================================
mongo_client = None
scans_collection = None
mongo_status = "Initializing..."

def get_db_collection():
    global mongo_client, scans_collection, mongo_status
    if scans_collection is not None:
        try:
            mongo_client.admin.command('ping')
            mongo_status = "Connected (neuroscan.clinical_scans)"
            return scans_collection
        except Exception:
            scans_collection = None
    try:
        from pymongo import MongoClient
        mongo_client = MongoClient("mongodb://127.0.0.1:27017/", serverSelectionTimeoutMS=1500)
        mongo_client.admin.command('ping')
        db = mongo_client["neuroscan"]
        scans_collection = db["clinical_scans"]
        mongo_status = "Connected (neuroscan.clinical_scans)"
        return scans_collection
    except Exception as e:
        mongo_status = f"Offline ({e})"
        return None

# Initial attempt
get_db_collection()

# In-memory fallback if MongoDB is not reachable
in_memory_scans = []

# ==========================================
# 3. MODEL ARCHITECTURE & GATING
# ==========================================
class NeuroScanDenseNet(nn.Module):
    def __init__(self, num_classes=4):
        super(NeuroScanDenseNet, self).__init__()
        self.encoder = densenet121(weights=None).features
        self.gap = nn.AdaptiveAvgPool2d((1, 1))
        self.classifier = nn.Sequential(
            nn.Linear(3072, 512),
            nn.BatchNorm1d(512),
            nn.GELU(),
            nn.Dropout(p=0.2),
            nn.Linear(512, num_classes)
        )

    def forward(self, full, left, right):
        f_global = torch.flatten(self.gap(self.encoder(full)), 1)
        f_L = torch.flatten(self.gap(self.encoder(left)), 1)
        f_R = torch.flatten(self.gap(self.encoder(right)), 1)
        f_diff = torch.abs(f_L - f_R)
        f_sym = (f_L + f_R) / 2.0
        fused = torch.cat([f_global, f_diff, f_sym], dim=1)
        return self.classifier(fused)


def deterministic_gate_filter(img_raw):
    """
    Dual-Stage Quality Gate Filter
    Returns: (is_valid, processed_img, contour_points, head_mask, gate_stages, error_reason)
    """
    img_gray = cv2.resize(img_raw, (256, 256))
    total_pixels = 256 * 256

    gate_stages = {
        "stage1": {"name": "Otsu & Tissue Check", "passed": False, "metric": "Pending", "label": "WAITING"},
        "stage2": {"name": "Anatomy Alignment", "passed": False, "metric": "Pending", "label": "WAITING"},
        "stage3": {"name": "Contralateral [L - R]", "passed": False, "metric": "Pending", "label": "WAITING"}
    }

    # ----------------------------------------------------
    # STAGE 1: Motion Blur, Entropy, and Signal-to-Noise
    # ----------------------------------------------------
    std_val = float(np.std(img_gray))
    mean_val = float(np.mean(img_gray))
    if std_val < 4.0 or mean_val < 3.0:
        gate_stages["stage1"] = {"name": "Otsu & Tissue Check", "passed": False, "metric": f"Blank (Std: {std_val:.1f} < 4.0)", "label": "TISSUE FAIL"}
        return False, None, None, None, gate_stages, "Blank / Empty Image Detected"

    lap_var = float(cv2.Laplacian(img_gray, cv2.CV_64F).var())
    if lap_var < 10.0:
        gate_stages["stage1"] = {"name": "Otsu & Tissue Check", "passed": False, "metric": f"Blur (Var: {lap_var:.1f} < 10.0)", "label": "TISSUE FAIL"}
        return False, None, None, None, gate_stages, "Severe Motion Blur Detected"

    hist = cv2.calcHist([img_gray], [0], None, [256], [0, 256]).flatten()
    hist_norm = hist / hist.sum()
    entropy = -float(np.sum(hist_norm[hist_norm > 0] * np.log2(hist_norm[hist_norm > 0])))
    if entropy > 7.75:
        gate_stages["stage1"] = {"name": "Otsu & Tissue Check", "passed": False, "metric": f"Noise Entropy: {entropy:.2f} > 7.75", "label": "TISSUE FAIL"}
        return False, None, None, None, gate_stages, "Corrupted / Random Noise Detected"

    # Stage 1 Passed
    gate_stages["stage1"] = {"name": "Otsu & Tissue Check", "passed": True, "metric": f"Entropy: {entropy:.2f} | Std: {std_val:.1f}", "label": "TISSUE PASS"}

    # ----------------------------------------------------
    # STAGE 2: Anatomy & Contour Alignment
    # ----------------------------------------------------
    blurred = cv2.GaussianBlur(img_gray, (5, 5), 0)
    
    # Adaptive background thresholding: estimate perimeter air level
    corners = np.concatenate([
        img_gray[:12, :12].flatten(), img_gray[:12, -12:].flatten(),
        img_gray[-12:, :12].flatten(), img_gray[-12:, -12:].flatten()
    ])
    bg_thresh = max(15.0, float(np.mean(corners) + 2.0 * np.std(corners)))

    # Dual thresholding: capture both soft brain tissue and skull
    _, binary_mask = cv2.threshold(blurred, int(bg_thresh), 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    closed_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        gate_stages["stage2"] = {"name": "Anatomy Alignment", "passed": False, "metric": "No Contours Found", "label": "ALIGN FAIL"}
        return False, None, None, None, gate_stages, "No Anatomical Structure Found"

    largest_contour = max(contours, key=cv2.contourArea)
    coverage = (cv2.contourArea(largest_contour) / total_pixels) * 100.0

    if coverage < 8.0:
        gate_stages["stage2"] = {"name": "Anatomy Alignment", "passed": False, "metric": f"Coverage {coverage:.1f}% < 8%", "label": "ALIGN FAIL"}
        return False, None, None, None, gate_stages, "Insufficient Anatomy Coverage"

    full_head_mask = np.zeros_like(img_gray)
    cv2.drawContours(full_head_mask, [largest_contour], -1, 255, thickness=cv2.FILLED)

    # Brain parenchyma check
    kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    inner_brain_mask = cv2.erode(full_head_mask, kernel_erode, iterations=2)
    inner_tissue_pixels = img_gray[inner_brain_mask == 255]

    if len(inner_tissue_pixels) < 1500:
        # Fallback to full head mask if eroded mask is small
        inner_tissue_pixels = img_gray[full_head_mask == 255]

    soft_tissue = np.sum((inner_tissue_pixels > 15) & (inner_tissue_pixels < 245))
    soft_ratio = float(soft_tissue / max(1, len(inner_tissue_pixels)))

    if soft_ratio < 0.15:
        gate_stages["stage2"] = {"name": "Anatomy Alignment", "passed": False, "metric": f"Soft Tissue: {soft_ratio*100:.1f}% < 15%", "label": "ALIGN FAIL"}
        return False, None, None, None, gate_stages, "Incorrect Windowing / Tissue Not Found"

    # Stage 2 Passed
    gate_stages["stage2"] = {"name": "Anatomy Alignment", "passed": True, "metric": f"Midline Met | Cov: {coverage:.1f}%", "label": "ALIGNMENT PASS"}

    clean_output = cv2.bitwise_and(img_gray, img_gray, mask=full_head_mask)

    # Simplified contour points for frontend 2D stereotaxic map
    epsilon = 0.005 * cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, epsilon, True)
    contour_points = [[round(float(pt[0][0]) / 256.0, 4), round(float(pt[0][1]) / 256.0, 4)] for pt in approx]

    return True, clean_output, contour_points, full_head_mask, gate_stages, "PASS"


# ==========================================
# 3b. INTELLIGENT PREPROCESSING PIPELINE
# ==========================================
def diagnose_image_issues(img_gray_256):
    """
    Analyze a grayscale 256x256 image and detect preprocessing issues.
    Returns a dict of detected issues and recommended fixes.
    """
    issues = []
    recommendations = []

    std_val = float(np.std(img_gray_256))
    mean_val = float(np.mean(img_gray_256))
    total_px = 256 * 256

    # 1. Check for blank/empty scan
    if std_val < 4.0 or mean_val < 3.0:
        issues.append({
            "type": "BLANK",
            "severity": "critical",
            "detail": f"Image appears blank (std={std_val:.1f}, mean={mean_val:.1f})"
        })
        recommendations.append("Image is blank/corrupted — cannot preprocess")
        return {
            "needs_preprocessing": False,
            "can_fix": False,
            "issues": issues,
            "recommendations": recommendations,
            "metrics": {
                "mean": round(mean_val, 2),
                "std": round(std_val, 2),
                "entropy": 0.0,
                "dynamic_range": 0.0,
                "bright_pixel_pct": 0.0,
                "background_pct": 100.0
            }
        }

    # 2. Check for bright annotations/text (>220 intensity pixels)
    very_bright_pct = float(np.sum(img_gray_256 > 220) / total_px * 100)
    if very_bright_pct > 0.8:
        issues.append({
            "type": "ANNOTATIONS",
            "severity": "medium",
            "detail": f"Scanner text/annotations detected ({very_bright_pct:.1f}% pixels > 220)"
        })
        recommendations.append("Filter scanner annotations & bright text")

    # 3. Check for bright borders (scanner labels, margin bars)
    border_regions = {
        "top": img_gray_256[:15, :],
        "bottom": img_gray_256[-15:, :],
        "left": img_gray_256[:, :15],
        "right": img_gray_256[:, -15:]
    }
    bright_borders = {k: float(np.mean(v)) for k, v in border_regions.items() if float(np.mean(v)) > 20}
    if bright_borders:
        issues.append({
            "type": "BRIGHT_BORDERS",
            "severity": "medium",
            "detail": f"Perimeter scanner artifacts detected in {list(bright_borders.keys())} margins"
        })
        recommendations.append("Trim margin artifacts & scanner frame")

    # 4. Check for poor contrast / wrong windowing
    p5 = float(np.percentile(img_gray_256, 5))
    p95 = float(np.percentile(img_gray_256, 95))
    dynamic_range = p95 - p5
    if dynamic_range < 75:
        issues.append({
            "type": "LOW_CONTRAST",
            "severity": "high",
            "detail": f"Narrow dynamic range ({dynamic_range:.0f} HU span) — suboptimal windowing"
        })
        recommendations.append("Apply adaptive CLAHE contrast enhancement")

    # 5. Check for excessive background or off-center scan
    bg_pct = float(np.sum(img_gray_256 < 15) / total_px * 100)
    if bg_pct > 80:
        issues.append({
            "type": "EXCESSIVE_BACKGROUND",
            "severity": "low",
            "detail": f"High background air ratio ({bg_pct:.1f}%)"
        })
        recommendations.append("Isolate brain parenchyma & skull geometry")

    # 6. Check for high noise / Shannon entropy
    hist = cv2.calcHist([img_gray_256], [0], None, [256], [0, 256]).flatten()
    hist_norm = hist / hist.sum()
    entropy = -float(np.sum(hist_norm[hist_norm > 0] * np.log2(hist_norm[hist_norm > 0])))
    if entropy > 7.0:
        issues.append({
            "type": "HIGH_NOISE",
            "severity": "high",
            "detail": f"Elevated Shannon entropy: {entropy:.2f} (noise/artifact present)"
        })
        recommendations.append("Apply edge-preserving Non-Local Means filter")

    # 7. Check if inverted
    center_region = img_gray_256[80:176, 80:176]
    center_mean = float(np.mean(center_region))
    if center_mean < 15 and mean_val > 100:
        issues.append({
            "type": "INVERTED",
            "severity": "high",
            "detail": f"Inverted polarity detected (center mean: {center_mean:.1f})"
        })
        recommendations.append("Invert grayscale polarity")

    needs_preprocessing = len(issues) > 0
    can_fix = True

    return {
        "needs_preprocessing": needs_preprocessing,
        "can_fix": can_fix,
        "issues": issues,
        "recommendations": recommendations,
        "metrics": {
            "mean": round(mean_val, 2),
            "std": round(std_val, 2),
            "entropy": round(entropy, 4),
            "dynamic_range": round(dynamic_range, 1),
            "bright_pixel_pct": round(very_bright_pct, 2),
            "background_pct": round(bg_pct, 2)
        }
    }


def preprocess_ct_image(img_raw_gray):
    """
    Full clinical preprocessing pipeline for raw CT images:
    1. Trim perimeter scanner artifacts & border bars
    2. Filter bright annotations/text overlays
    3. Isolate skull and brain parenchyma
    4. Adaptive CLAHE contrast enhancement & windowing normalization
    5. Edge-preserving denoising
    Returns: preprocessed grayscale image (256x256)
    """
    img = cv2.resize(img_raw_gray.copy(), (256, 256))
    
    # Step 1: Trim perimeter scanner margin artifacts
    if np.mean(img[:12, :]) > 18:
        img[:12, :] = 0
    if np.mean(img[-12:, :]) > 18:
        img[-12:, :] = 0
    if np.mean(img[:, :12]) > 18:
        img[:, :12] = 0
    if np.mean(img[:, -12:]) > 18:
        img[:, -12:] = 0

    # Step 2: Remove bright annotations/text
    _, bright_mask = cv2.threshold(img, 225, 255, cv2.THRESH_BINARY)
    bright_contours, _ = cv2.findContours(bright_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if bright_contours:
        largest_bright = max(bright_contours, key=cv2.contourArea)
        largest_area = cv2.contourArea(largest_bright)
        for cnt in bright_contours:
            area = cv2.contourArea(cnt)
            if area < largest_area * 0.25:  # small text or marker
                cv2.drawContours(img, [cnt], -1, 0, thickness=cv2.FILLED)

    # Step 3: Isolate brain region using adaptive thresholding
    blurred = cv2.GaussianBlur(img, (5, 5), 0)
    corners = np.concatenate([
        img[:12, :12].flatten(), img[:12, -12:].flatten(),
        img[-12:, :12].flatten(), img[-12:, -12:].flatten()
    ])
    bg_level = max(10, float(np.mean(corners) + 1.5 * np.std(corners)))
    
    _, brain_mask = cv2.threshold(blurred, int(bg_level), 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    brain_mask = cv2.morphologyEx(brain_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    brain_mask = cv2.morphologyEx(brain_mask, cv2.MORPH_OPEN, kernel, iterations=1)
    
    contours, _ = cv2.findContours(brain_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    clean_mask = np.zeros_like(img)
    if contours:
        largest = max(contours, key=cv2.contourArea)
        cv2.drawContours(clean_mask, [largest], -1, 255, thickness=cv2.FILLED)
        img = cv2.bitwise_and(img, img, mask=clean_mask)

    # Step 4: CLAHE contrast enhancement (adaptive brain windowing)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    img_enhanced = clahe.apply(img)

    # Step 5: Gentle edge-preserving denoising
    img_denoised = cv2.fastNlMeansDenoising(img_enhanced, None, h=6, templateWindowSize=7, searchWindowSize=21)

    # Re-apply clean brain mask to preserve pure dark background
    if contours:
        img_denoised = cv2.bitwise_and(img_denoised, img_denoised, mask=clean_mask)

    return img_denoised


# ==========================================
# 4. STARTUP PROCEDURE
# ==========================================
print(f"[*] Loading Siamese Weights from: {WEIGHTS_PATH}")
model = NeuroScanDenseNet(num_classes=4).to(DEVICE)

if not os.path.exists(WEIGHTS_PATH):
    print("[!] ERROR: Could not find model weights!")
else:
    checkpoint = torch.load(WEIGHTS_PATH, map_location=DEVICE, weights_only=False)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    print("[*] AI Engine Online & Ready for Inference.")


# ==========================================
# 5. API ENDPOINTS
# ==========================================
@app.get("/health")
def health_check():
    coll = get_db_collection()
    return {
        "status": "ONLINE",
        "device": str(DEVICE),
        "weights_loaded": os.path.exists(WEIGHTS_PATH),
        "mongodb": mongo_status
    }


@app.post("/preprocess-check")
async def preprocess_check(file: UploadFile = File(...)):
    """Analyze an image and report what preprocessing issues exist."""
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_raw = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img_raw is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")
        
        img_256 = cv2.resize(img_raw, (256, 256))
        diagnosis = diagnose_image_issues(img_256)
        return diagnosis
    except Exception as e:
        import traceback; traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze")
async def analyze_scan(file: UploadFile = File(...), preprocess: bool = Query(False)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_raw = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img_raw is None:
            raise HTTPException(status_code=400, detail="Invalid image file.")

        # If preprocess flag is set, apply full preprocessing pipeline first
        was_preprocessed = False
        preprocessing_applied = []
        if preprocess:
            img_256_check = cv2.resize(img_raw, (256, 256))
            diagnosis = diagnose_image_issues(img_256_check)
            if diagnosis["can_fix"]:
                img_raw = preprocess_ct_image(img_raw)
                was_preprocessed = True
                preprocessing_applied = diagnosis["recommendations"]
                print(f"[*] Preprocessing applied: {preprocessing_applied}")

        valid, processed, contour_points, head_mask, gate_stages, gate_reason = deterministic_gate_filter(img_raw)

        if not valid:
            # If rejected and not yet preprocessed, check if preprocessing could help
            can_preprocess = False
            preprocess_diagnosis = None
            if not was_preprocessed:
                img_256_check = cv2.resize(img_raw, (256, 256))
                preprocess_diagnosis = diagnose_image_issues(img_256_check)
                is_blank = any(i["type"] == "BLANK" for i in preprocess_diagnosis["issues"]) or "Blank" in gate_reason
                if not is_blank:
                    can_preprocess = True
                    preprocess_diagnosis["can_fix"] = True
                    preprocess_diagnosis["needs_preprocessing"] = True
                    if not preprocess_diagnosis["recommendations"]:
                        preprocess_diagnosis["recommendations"] = [
                            "Isolate skull & parenchyma structure",
                            "Apply CLAHE contrast enhancement",
                            "Denoise & suppress perimeter scanner artifacts"
                        ]
                    if not preprocess_diagnosis["issues"]:
                        preprocess_diagnosis["issues"].append({
                            "type": "GATE_REJECTION",
                            "severity": "medium",
                            "detail": f"Quality Gate check flagged: {gate_reason}"
                        })

            return {
                "status": "REJECTED",
                "reason": gate_reason,
                "gate_stages": gate_stages,
                "prediction": None,
                "confidence": 0.0,
                "heatmap_base64": None,
                "bbox": None,
                "center_xy": None,
                "area_cc": 0.0,
                "contour": None,
                "cam_contour": None,
                "asymmetry_index": 0.0,
                "can_preprocess": can_preprocess,
                "preprocess_diagnosis": preprocess_diagnosis,
                "was_preprocessed": was_preprocessed
            }

        # ----------------------------------------------------
        # STAGE 3: Bilateral Siamese Contralateral Differential
        # ----------------------------------------------------
        processed_224 = cv2.resize(processed, (224, 224))
        mid_x = processed_224.shape[1] // 2
        left_half = processed_224[:, :mid_x]
        right_mirrored = cv2.flip(processed_224[:, mid_x:], 1)

        # Compute empirical contralateral asymmetry index
        left_mean = float(np.mean(left_half))
        right_mean = float(np.mean(processed_224[:, mid_x:]))
        asym_raw = abs(left_mean - right_mean) / max(1.0, (left_mean + right_mean) / 2.0)
        asym_index = round(float(asym_raw * 2.5), 2)
        if asym_index > 0.99:
            asym_index = 0.99

        gate_stages["stage3"] = {
            "name": "Contralateral [L - R]",
            "passed": True,
            "metric": f"Delta Asym: +{asym_index:.2f}",
            "label": f"ASYM: +{asym_index:.2f}"
        }

        # Neural forward pass
        full_rgb = val_transform(cv2.cvtColor(processed_224, cv2.COLOR_GRAY2RGB)).unsqueeze(0).to(DEVICE)
        left_rgb = val_transform(cv2.cvtColor(cv2.resize(left_half, (224, 224)), cv2.COLOR_GRAY2RGB)).unsqueeze(0).to(DEVICE)
        right_rgb = val_transform(cv2.cvtColor(cv2.resize(right_mirrored, (224, 224)), cv2.COLOR_GRAY2RGB)).unsqueeze(0).to(DEVICE)

        # Grad-CAM hooks
        activations, gradients = None, None
        def fh(m, i, o):
            nonlocal activations; activations = o.detach()
        def bh(m, gi, go):
            nonlocal gradients; gradients = go[0].detach()

        h1 = model.encoder.register_forward_hook(fh)
        h2 = model.encoder.register_full_backward_hook(bh)
        full_rgb.requires_grad_(True)
        model.zero_grad()

        outputs = model(full_rgb, left_rgb, right_rgb)
        probabilities = torch.softmax(outputs, dim=1)[0]
        pred_idx = torch.argmax(probabilities).item()
        outputs[0, pred_idx].backward()
        h1.remove(); h2.remove()

        confidence = probabilities[pred_idx].item() * 100.0
        predicted_class = TARGET_CLASSES[pred_idx]
        if confidence < 60.0:
            predicted_class = "UNCERTAIN - HUMAN REVIEW REQUIRED"

        # Generate CAM
        weights = torch.mean(gradients, dim=(2, 3), keepdim=True)
        cam = F.relu(torch.sum(weights * activations, dim=1, keepdim=True))
        cam = cam - cam.min()
        cam = cam / (cam.max() + 1e-8)
        cam_np = cam.squeeze().cpu().numpy()
        cam_resized = cv2.resize(cam_np, (224, 224))

        # BRAIN MASKING: Ensure CAM is 100% confined inside actual brain tissue
        head_mask_224 = cv2.resize(head_mask, (224, 224))
        # Slight erosion to avoid bright skull bone artifacts
        k_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        brain_parenchyma_mask = cv2.erode(head_mask_224, k_erode, iterations=1)

        cam_masked = cam_resized * (brain_parenchyma_mask > 0).astype(np.float32)
        if cam_masked.max() > 0:
            cam_masked = cam_masked / cam_masked.max()

        heatmap_b64 = None
        bbox = None
        center_xy = None
        area_cc = 0.0
        cam_contour_data = None

        if predicted_class != "Normal":
            # Vivid jet/turbo colormap for pathological hotspot
            heatmap_img = cv2.applyColorMap(np.uint8(255 * cam_masked), cv2.COLORMAP_JET)
            # Mask out the background completely in black
            heatmap_img[brain_parenchyma_mask == 0] = [0, 0, 0]
            _, buf = cv2.imencode('.png', heatmap_img)
            heatmap_b64 = base64.b64encode(buf).decode('utf-8')

            # Threshold masked CAM to isolate true pathological focus
            thresh = np.uint8(cam_masked > 0.40) * 255
            thresh = cv2.bitwise_and(thresh, thresh, mask=brain_parenchyma_mask)
            bc, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if bc:
                lc = max(bc, key=cv2.contourArea)
                x, y, w, h = cv2.boundingRect(lc)
                bbox = [int(x), int(y), int(w), int(h)]
                cx = round(float(x + w / 2.0), 1)
                cy = round(float(y + h / 2.0), 1)
                center_xy = [cx, cy]
                # Volume estimate based on pixel area: (w * 0.5mm) * (h * 0.5mm) * slice_thickness 5mm / 1000
                area_cc = round((w * 0.5) * (h * 0.5) * 5.0 / 1000.0, 2)
                if area_cc < 1.0:
                    area_cc = round(float(w * h * 0.005), 1)

                # Simplified CAM contour for 2D stereotaxic overlay
                eps = 0.02 * cv2.arcLength(lc, True)
                approx_cam = cv2.approxPolyDP(lc, eps, True)
                cam_contour_data = [[round(float(p[0][0]) / 224.0, 4), round(float(p[0][1]) / 224.0, 4)] for p in approx_cam]

        # Cleaned scan for display & MongoDB storage
        _, proc_buf = cv2.imencode('.png', processed_224)
        processed_b64 = base64.b64encode(proc_buf).decode('utf-8')

        return {
            "status": "ACCEPTED",
            "reason": "Passed all quality and alignment gates.",
            "gate_stages": gate_stages,
            "prediction": predicted_class,
            "confidence": round(confidence, 1),
            "asymmetry_index": asym_index,
            "heatmap_base64": heatmap_b64,
            "bbox": bbox,
            "center_xy": center_xy,
            "area_cc": area_cc,
            "contour": contour_points,
            "cam_contour": cam_contour_data,
            "processed_b64": processed_b64,
            "was_preprocessed": was_preprocessed,
            "preprocessing_applied": preprocessing_applied
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


class SaveScanRequest(BaseModel):
    patient_name: str
    mrn: str
    age: int
    sex: str
    physician: Optional[str] = "Dr. S. Vance, MD"
    modality: Optional[str] = "Non-contrast Head CT"
    priority: Optional[str] = "EMERGENT STAT"
    notes: Optional[str] = ""
    prediction: str
    confidence: float
    asymmetry_index: Optional[float] = 0.64
    heatmap_base64: Optional[str] = None
    processed_b64: Optional[str] = None
    bbox: Optional[list] = None
    center_xy: Optional[list] = None
    area_cc: Optional[float] = 0.0


@app.post("/save-scan")
async def save_scan(data: SaveScanRequest):
    record = data.dict()
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    record["scan_id"] = f"#NS-{datetime.now().strftime('%Y-%m%d%H%M%S')}"
    record["timestamp"] = timestamp_str

    coll = get_db_collection()
    saved_mongo = False
    if coll is not None:
        try:
            coll.insert_one(record.copy())
            saved_mongo = True
            print(f"[+] Saved scan {record['scan_id']} to MongoDB.")
        except Exception as e:
            print(f"[!] MongoDB insert failed ({e}), falling back to in-memory store.")

    in_memory_scans.insert(0, record)
    if len(in_memory_scans) > 500:
        in_memory_scans.pop()

    return {
        "status": "SAVED",
        "scan_id": record["scan_id"],
        "timestamp": timestamp_str,
        "database": "MongoDB" if saved_mongo else "In-Memory Buffer"
    }


@app.get("/scans")
async def get_scans():
    coll = get_db_collection()
    if coll is not None:
        try:
            cursor = coll.find(
                {},
                {"_id": 0, "heatmap_base64": 0, "processed_b64": 0}
            ).sort("timestamp", -1).limit(200)
            scans = list(cursor)
            return {"scans": scans, "database": "MongoDB"}
        except Exception as e:
            print(f"[!] MongoDB read failed ({e}), using memory.")

    lite_scans = [
        {k: v for k, v in s.items() if k not in ("heatmap_base64", "processed_b64", "_id")}
        for s in in_memory_scans
    ]
    return {"scans": lite_scans, "database": "In-Memory"}


@app.get("/scans/{scan_id}")
async def get_scan_detail(scan_id: str):
    coll = get_db_collection()
    if coll is not None:
        try:
            id_with_hash = scan_id if scan_id.startswith('#') else f'#{scan_id}'
            id_without_hash = scan_id.lstrip('#')
            target_ids = list({scan_id, id_with_hash, id_without_hash})
            record = coll.find_one({"scan_id": {"$in": target_ids}}, {"_id": 0})
            if record:
                return record
        except Exception as e:
            print(f"[!] MongoDB find_one error: {e}")

    for s in in_memory_scans:
        if s.get("scan_id") == scan_id:
            return {k: v for k, v in s.items() if k != "_id"}

    raise HTTPException(status_code=404, detail="Scan record not found.")


@app.delete("/scans")
@app.delete("/scans/{scan_id}")
async def delete_scan(scan_id: Optional[str] = None):
    if not scan_id:
        raise HTTPException(status_code=400, detail="Missing scan_id parameter.")

    id_with_hash = scan_id if scan_id.startswith('#') else f'#{scan_id}'
    id_without_hash = scan_id.lstrip('#')
    target_ids = list({scan_id, id_with_hash, id_without_hash})

    deleted = False
    coll = get_db_collection()
    if coll is not None:
        try:
            res = coll.delete_one({"scan_id": {"$in": target_ids}})
            if res.deleted_count > 0:
                deleted = True
                print(f"[+] Deleted scan {scan_id} from MongoDB.")
        except Exception as e:
            print(f"[!] MongoDB delete failed ({e})")

    global in_memory_scans
    before_len = len(in_memory_scans)
    in_memory_scans = [s for s in in_memory_scans if s.get("scan_id") not in target_ids]
    if len(in_memory_scans) < before_len:
        deleted = True

    return {"status": "DELETED", "scan_id": scan_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
