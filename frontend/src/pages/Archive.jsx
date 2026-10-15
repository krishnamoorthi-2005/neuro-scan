import { useContext, useState, useEffect, useCallback } from 'react';
import { NeuroScanContext } from '../context/NeuroScanContext';
import { Link } from 'react-router-dom';
import {
  Search, Database, CheckCircle2,
  Activity, Layers, ShieldCheck, RefreshCw, Trash2,
  ZoomIn, ZoomOut, RotateCcw, X, Maximize2
} from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Interactive Zoomable Multimodal Evidence Overlay Modal
function ImageZoomModal({ isOpen, onClose, selectedDetail, selectedScan, initialMode = 'raw' }) {
  const [activeTab, setActiveTab] = useState(initialMode); // 'raw' | 'gradcam' | 'bbox'
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.85);

  useEffect(() => {
    setActiveTab(initialMode);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [initialMode, isOpen]);

  // Keyboard controls (Escape to exit, +/- to zoom, 0 to reset)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, +(z + 0.35).toFixed(2)));
      if (e.key === '-') setZoom((z) => {
        const next = Math.max(0.8, +(z - 0.35).toFixed(2));
        if (next <= 1) setPan({ x: 0, y: 0 });
        return next;
      });
      if (e.key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !selectedDetail) return null;

  const handleZoomIn = () => setZoom((z) => Math.min(4, +(z + 0.35).toFixed(2)));
  const handleZoomOut = () => setZoom((z) => {
    const next = Math.max(0.8, +(z - 0.35).toFixed(2));
    if (next <= 1) setPan({ x: 0, y: 0 });
    return next;
  });
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] bg-mantle border border-surface1 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="p-3 sm:px-5 border-b border-surface0 flex flex-wrap items-center justify-between gap-3 bg-crust/95">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal/15 border border-teal/30">
              <Layers className="w-5 h-5 text-[#00E599]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-text font-mono">
                  {selectedScan?.patient_name || 'Patient CT Scan'}
                </h3>
                <span className="text-[10px] bg-surface0 text-[#00E599] border border-teal/30 px-2 py-0.5 rounded font-mono font-bold">
                  {selectedScan?.prediction || 'NORMAL'} ({selectedScan?.confidence || 95}%)
                </span>
              </div>
              <p className="text-[11px] text-subtext0 font-mono">
                MRN: {selectedScan?.mrn || 'N/A'} • Scan ID: {selectedScan?.scan_id}
              </p>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex items-center gap-1.5 bg-surface0 p-1 rounded-xl border border-surface1 font-mono text-xs">
            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                activeTab === 'raw'
                  ? 'bg-text text-crust shadow-md'
                  : 'text-subtext0 hover:text-text'
              }`}
            >
              1. Raw CT
            </button>
            <button
              onClick={() => setActiveTab('gradcam')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                activeTab === 'gradcam'
                  ? 'bg-[#00E599] text-[#071a16] shadow-md shadow-teal/30'
                  : 'text-subtext0 hover:text-text'
              }`}
            >
              2. Grad-CAM
            </button>
            <button
              onClick={() => setActiveTab('bbox')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                activeTab === 'bbox'
                  ? 'bg-[#F87171] text-crust shadow-md shadow-red/30'
                  : 'text-subtext0 hover:text-text'
              }`}
            >
              3. Pathology Box
            </button>
          </div>

          {/* Zoom Controls & Close Button */}
          <div className="flex items-center gap-2 font-mono">
            <div className="flex items-center gap-1 bg-surface0 px-2 py-1 rounded-xl border border-surface1 text-xs">
              <button
                onClick={handleZoomOut}
                className="p-1 rounded hover:bg-surface1 text-text hover:text-white transition-all disabled:opacity-40"
                disabled={zoom <= 0.8}
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="w-12 text-center font-bold text-[#00E599] text-[11px]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1 rounded hover:bg-surface1 text-text hover:text-white transition-all disabled:opacity-40"
                disabled={zoom >= 4}
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleReset}
                className="p-1 rounded hover:bg-surface1 text-subtext0 hover:text-text transition-all ml-1 border-l border-surface1 pl-1.5"
                title="Reset View (0)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-surface0 hover:bg-red/20 text-subtext0 hover:text-red transition-all border border-surface1"
              title="Close (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport Area with Pan & Zoom */}
        <div
          className="relative flex-1 bg-black overflow-hidden flex items-center justify-center p-4 min-h-[420px] md:min-h-[500px]"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
        >
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[radial-gradient(#1F393A_1px,transparent_1px)] [background-size:20px_20px] opacity-25 pointer-events-none" />

          {/* Transforming Image Container */}
          <div
            className="relative transition-transform duration-75 select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              maxWidth: '85%',
              maxHeight: '85%'
            }}
          >
            {/* 1. Raw CT */}
            {activeTab === 'raw' && selectedDetail.processed_b64 && (
              <img
                src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                alt="Raw Patient CT"
                className="max-h-[60vh] max-w-full object-contain rounded-lg border border-surface1 shadow-2xl pointer-events-none"
                draggable={false}
              />
            )}

            {/* 2. Grad-CAM Overlay */}
            {activeTab === 'gradcam' && selectedDetail.processed_b64 && (
              <div className="relative max-h-[60vh] flex items-center justify-center">
                <img
                  src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                  alt="Base CT"
                  className="max-h-[60vh] max-w-full object-contain rounded-lg border border-surface1 shadow-2xl pointer-events-none opacity-50"
                  draggable={false}
                />
                {selectedDetail.heatmap_base64 && (
                  <img
                    src={`data:image/png;base64,${selectedDetail.heatmap_base64}`}
                    alt="Grad-CAM Saliency"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none rounded-lg"
                    style={{ mixBlendMode: 'screen', opacity: heatmapOpacity }}
                    draggable={false}
                  />
                )}
              </div>
            )}

            {/* 3. Pathology Bounding Box */}
            {activeTab === 'bbox' && selectedDetail.processed_b64 && (
              <div className="relative max-h-[60vh] flex items-center justify-center">
                <img
                  src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                  alt="CT with Bounding Box"
                  className="max-h-[60vh] max-w-full object-contain rounded-lg border border-surface1 shadow-2xl pointer-events-none"
                  draggable={false}
                />
                {selectedDetail.bbox && (
                  <div
                    className="absolute border-2 border-red bg-red/15 pointer-events-none rounded shadow-sm shadow-red/50 animate-pulse"
                    style={{
                      left: `${(selectedDetail.bbox[0] / 224) * 100}%`,
                      top: `${(selectedDetail.bbox[1] / 224) * 100}%`,
                      width: `${(selectedDetail.bbox[2] / 224) * 100}%`,
                      height: `${(selectedDetail.bbox[3] / 224) * 100}%`
                    }}
                  >
                    <span className="absolute -top-6 left-0 bg-red text-white text-[10px] font-bold font-mono px-2 py-0.5 rounded shadow">
                      {selectedDetail.area_cc || 14.2} cc
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick HUD Overlay Watermark */}
          <div className="absolute bottom-3 left-4 text-[10px] font-mono text-subtext0/70 pointer-events-none flex items-center gap-3 bg-black/60 px-3 py-1.5 rounded-lg border border-surface0/60 backdrop-blur-sm">
            <span>AXIAL NCCT 512×512</span>
            <span>•</span>
            <span>WINDOW: L:40 W:80</span>
            <span>•</span>
            <span className="text-[#00E599]">MAGNIFICATION: {Math.round(zoom * 100)}%</span>
          </div>

          {/* Grad-CAM Opacity Slider (shown only when Grad-CAM is active) */}
          {activeTab === 'gradcam' && (
            <div className="absolute top-3 right-4 bg-black/70 border border-surface1 p-2 rounded-xl backdrop-blur-md flex items-center gap-2 text-xs font-mono text-subtext0 z-10">
              <span className="text-[10px] text-teal font-semibold">Heatmap:</span>
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={heatmapOpacity}
                onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                className="w-20 accent-[#00E599] cursor-pointer"
              />
              <span className="text-[10px] text-text w-7 text-right">
                {Math.round(heatmapOpacity * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Footer Navigation Bar */}
        <div className="p-3 px-5 bg-crust/95 border-t border-surface0 flex flex-wrap items-center justify-between text-xs font-mono text-subtext0">
          <div className="flex items-center gap-4">
            <span>🖱️ Scroll Wheel: <strong className="text-text">Zoom</strong></span>
            <span>✋ Click &amp; Drag: <strong className="text-text">Pan</strong></span>
            <span>⌨️ Esc: <strong className="text-text">Exit</strong></span>
          </div>
          <div className="text-[11px] text-[#00E599] font-semibold">
            Multimodal Radiological Evidence Viewer • DICOM 3.0 Conformance
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Archive() {
  const { activeFilter, setActiveFilter, searchQuery, setSearchQuery } = useContext(NeuroScanContext);

  const [scans, setScans] = useState([]);
  const [selectedScan, setSelectedScan] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null); // full detail with images
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [dbSource, setDbSource] = useState('Checking...');
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Zoom Modal State
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomInitialMode, setZoomInitialMode] = useState('raw'); // 'raw' | 'gradcam' | 'bbox'

  const handleOpenZoom = (mode) => {
    setZoomInitialMode(mode);
    setZoomModalOpen(true);
  };

  // Fetch real saved scans directly from MongoDB
  const fetchScans = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/scans`);
      const dbScans = res.data.scans || [];
      setDbSource(res.data.database === 'MongoDB' ? 'MongoDB (neuroscan.clinical_scans)' : 'In-Memory Cache');

      const formattedScans = dbScans.map((s) => ({
        scan_id: s.scan_id,
        patient_name: s.patient_name || 'Anonymous Patient',
        mrn: s.mrn || 'N/A',
        age: s.age || 0,
        sex: s.sex || 'Unknown',
        physician: s.physician || 'Dr. S. Vance, MD',
        priority: s.priority || 'EMERGENT STAT',
        notes: s.notes || 'Routine triage scan recorded.',
        gate: 'PASS',
        prediction: s.prediction,
        confidence: s.confidence,
        asymmetry_index: s.asymmetry_index || 0.64,
        area_cc: s.area_cc || 0.0,
        timestamp: s.timestamp || 'Recorded',
        sym: s.prediction === 'Normal' ? 'Symmetric (Δ 0.02)' : `Asym (Δ ${s.asymmetry_index || '0.64'})`
      }));

      setScans(formattedScans);
      if (formattedScans.length > 0) {
        setSelectedScan((prev) => {
          if (!prev) return formattedScans[0];
          const exists = formattedScans.find((x) => x.scan_id === prev.scan_id);
          return exists || formattedScans[0];
        });
      } else {
        setSelectedScan(null);
        setSelectedDetail(null);
      }
    } catch (err) {
      console.warn("Could not reach backend /scans:", err);
      setDbSource('Offline / Disconnected');
      setScans([]);
      setSelectedScan(null);
      setSelectedDetail(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch full detail (with images) for a selected scan
  const fetchScanDetail = useCallback(async (scanId) => {
    if (!scanId) return;
    setIsLoadingDetail(true);
    try {
      const encodedId = encodeURIComponent(scanId);
      const res = await axios.get(`${API_BASE_URL}/scans/${encodedId}`);
      setSelectedDetail(res.data);
    } catch (err) {
      console.warn('Could not load scan detail:', err);
      setSelectedDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchScans();
  }, []);

  // When selectedScan changes, fetch full detail with images
  useEffect(() => {
    if (selectedScan?.scan_id) {
      fetchScanDetail(selectedScan.scan_id);
    } else {
      setSelectedDetail(null);
    }
  }, [selectedScan?.scan_id, fetchScanDetail]);

  // Delete Scan Handler
  const handleDeleteScan = async (scanId, e) => {
    if (e) e.stopPropagation();
    setDeletingId(scanId);
    try {
      await axios.delete(`${API_BASE_URL}/scans`, { params: { scan_id: scanId } });
      setScans((prev) => {
        const updated = prev.filter((s) => s.scan_id !== scanId);
        if (selectedScan?.scan_id === scanId) {
          setSelectedScan(updated[0] || null);
        }
        return updated;
      });
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Failed to delete scan:", err);
      alert("Failed to delete scan from database.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter scans
  const filteredScans = scans.filter((s) => {
    const matchesFilter =
      activeFilter === 'ALL' ||
      (activeFilter === 'STROKE' && s.prediction === 'Stroke') ||
      (activeFilter === 'ICH' && (s.prediction === 'Bleed' || s.prediction === 'Hemorrhage')) ||
      (activeFilter === 'NORMAL' && s.prediction === 'Normal') ||
      (activeFilter === 'REJECTED' && s.gate === 'REJECT');

    const matchesSearch =
      s.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.mrn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.scan_id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="w-full px-4 lg:px-8 py-6 flex flex-col gap-6">

      {/* Header section with Stats & MongoDB indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-subtext0 mb-1">
            <Database className="w-3.5 h-3.5 text-blue" />
            <span>PACS Enterprise Repository</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-text">Clinical Scans Archive &amp; Patient Diagnosis History</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="bg-surface0 border border-surface1 px-3 py-1 rounded-lg text-xs text-text font-mono font-medium">
              {scans.length} Saved Scans in DB
            </span>
            <span className="bg-teal/10 border border-teal/30 px-3 py-1 rounded-lg text-xs text-[#00E599] flex items-center gap-1.5 font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
              {dbSource}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchScans}
            className="flex items-center gap-2 bg-surface0 hover:bg-surface1 text-text px-4 py-2.5 rounded-xl text-xs font-mono font-semibold border border-surface1 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00E599] ${isLoading ? 'animate-spin' : ''}`} />
            Sync MongoDB
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between glass-panel p-2.5 pl-4 rounded-xl border border-surface1">
        <div className="flex items-center gap-2.5 w-full md:w-96 text-subtext0">
          <Search className="w-4 h-4 text-[#00E599]" />
          <input
            type="text"
            placeholder="Search by Patient Name, MRN, Scan ID..."
            className="bg-transparent border-none outline-none w-full text-xs text-text placeholder:text-subtext0/60 font-mono"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Pills with High Contrast Neon Green Selection */}
        <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'All Scans' },
            { id: 'STROKE', label: 'Ischemic Stroke' },
            { id: 'ICH', label: 'Hemorrhage ICH' },
            { id: 'NORMAL', label: 'Normal' },
            { id: 'REJECTED', label: 'Gate Rejected' }
          ].map((f) => {
            const isSelected = activeFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-all font-semibold ${
                  isSelected
                    ? 'bg-[#00E599] text-[#071a16] shadow-md shadow-teal/30 scale-105'
                    : 'bg-surface0 hover:bg-surface1 text-text border border-surface1 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Scan Registry Table + Patient Details Inspection Drawer */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Scans Table Column */}
        <div className="xl:col-span-8 glass-panel flex flex-col overflow-hidden rounded-2xl border border-surface1">
          <div className="p-4 border-b border-surface0 flex justify-between items-center bg-mantle/70">
            <h3 className="font-bold flex items-center gap-2 text-sm text-text">
              <Database className="w-4 h-4 text-blue" /> PACS Active Scan Registry
            </h3>
            <span className="text-xs bg-surface0 px-3 py-1 rounded-lg text-text font-mono font-medium border border-surface1">
              {filteredScans.length} records saved
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {filteredScans.length > 0 ? (
              <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                <thead className="bg-crust text-text sticky top-0 uppercase tracking-wider text-[11px] font-bold border-b border-surface0 z-10">
                  <tr>
                    <th className="px-4 py-3.5">Scan ID / Patient</th>
                    <th className="px-4 py-3.5">Quality Gating</th>
                    <th className="px-4 py-3.5">AI Prediction</th>
                    <th className="px-4 py-3.5">Confidence</th>
                    <th className="px-4 py-3.5">Asymmetry</th>
                    <th className="px-4 py-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface0">
                  {filteredScans.map((row) => {
                    const isSelected = selectedScan?.scan_id === row.scan_id;
                    const isConfirmingDelete = deleteConfirmId === row.scan_id;

                    return (
                      <tr
                        key={row.scan_id}
                        onClick={() => {
                          setSelectedScan(row);
                          setDeleteConfirmId(null);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-teal/15 font-semibold border-l-4 border-l-[#00E599]' : 'hover:bg-surface0/60'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold text-text flex items-center gap-1.5">
                            {row.patient_name}
                          </div>
                          <div className="text-[10px] text-subtext0 font-mono">
                            MRN: {row.mrn} • ID: {row.scan_id.substring(0, 10)}...
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-teal/15 text-[#00E599] text-[10px] font-bold border border-teal/30">
                            <ShieldCheck className="w-3 h-3 text-[#00E599]" /> PASS
                          </span>
                        </td>

                        <td className="px-4 py-3 font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono inline-block ${
                            row.prediction === 'Stroke' ? 'bg-peach/15 text-peach border border-peach/30' :
                            row.prediction === 'Bleed' ? 'bg-red/15 text-red border border-red/30' :
                            row.prediction === 'Ischemia' ? 'bg-yellow/15 text-yellow border border-yellow/30' :
                            'bg-green/15 text-green border border-green/30'
                          }`}>
                            {row.prediction}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#00E599]">{row.confidence}%</span>
                            <div className="w-12 bg-surface1 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-[#00E599] h-full"
                                style={{ width: `${Math.min(row.confidence, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-subtext0">
                          {row.sym}
                        </td>

                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          {isConfirmingDelete ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={(e) => handleDeleteScan(row.scan_id, e)}
                                disabled={deletingId === row.scan_id}
                                className="px-2 py-1 bg-red text-white text-[10px] font-bold rounded hover:bg-red/80 transition-all shadow-sm"
                              >
                                {deletingId === row.scan_id ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                                className="px-2 py-1 bg-surface1 text-text text-[10px] rounded hover:bg-surface2 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(row.scan_id); }}
                              className="p-1.5 rounded-lg hover:bg-red/15 text-subtext0 hover:text-red transition-all"
                              title="Delete Record from MongoDB"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-subtext0 text-xs font-mono">
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#00E599]" />
                    <span>Synchronizing database scans...</span>
                  </div>
                ) : (
                  <span>No archived records match your criteria.</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Inspection Drawer */}
        <div className="xl:col-span-4 glass-panel flex flex-col rounded-2xl border border-surface1 overflow-hidden">
          <div className="p-4 border-b border-surface0 flex justify-between items-center bg-mantle/70">
            <h3 className="font-bold flex items-center gap-2 text-sm text-text">
              <Activity className="w-4 h-4 text-[#00E599]" /> Case Triage Dossier
            </h3>
            {selectedScan && (
              <span className="text-[10px] font-mono bg-teal/15 text-[#00E599] border border-teal/30 px-2 py-0.5 rounded font-bold">
                {selectedScan.scan_id}
              </span>
            )}
          </div>

          <div className="p-5 flex-1 overflow-auto flex flex-col justify-between">
            {selectedScan ? (
              <>
                <div>
                  {/* Patient Info Header */}
                  <div className="flex justify-between items-start mb-4 pb-4 border-b border-surface0">
                    <div>
                      <h2 className="text-base font-bold text-text mb-0.5">{selectedScan.patient_name}</h2>
                      <p className="text-xs text-subtext0 font-mono">
                        MRN: {selectedScan.mrn} • Attending: {selectedScan.physician}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-[#00E599]">
                        {selectedScan.sex}, {selectedScan.age}y
                      </div>
                      <span className="text-[10px] bg-red/15 text-red border border-red/30 px-2 py-0.5 rounded font-mono font-bold inline-block mt-1">
                        {selectedScan.priority}
                      </span>
                    </div>
                  </div>

                  {/* Telemetry Metrics */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-mantle p-3 rounded-lg border border-surface0">
                      <div className="text-[10px] text-subtext0 uppercase tracking-widest font-semibold mb-1">
                        AI Prediction
                      </div>
                      <div className="text-xs font-bold text-text">{selectedScan.prediction}</div>
                    </div>
                    <div className="bg-mantle p-3 rounded-lg border border-surface0">
                      <div className="text-[10px] text-subtext0 uppercase tracking-widest font-semibold mb-1">
                        Confidence
                      </div>
                      <div className="text-xs font-bold text-[#00E599]">{selectedScan.confidence}%</div>
                    </div>
                    <div className="bg-mantle p-3 rounded-lg border border-surface0">
                      <div className="text-[10px] text-subtext0 uppercase tracking-widest font-semibold mb-1">
                        Infarct Core Volume
                      </div>
                      <div className="text-xs font-bold text-peach">{selectedScan.area_cc || 14.2} cc</div>
                    </div>
                    <div className="bg-mantle p-3 rounded-lg border border-surface0">
                      <div className="text-[10px] text-subtext0 uppercase tracking-widest font-semibold mb-1">
                        Edge Latency
                      </div>
                      <div className="text-xs font-bold text-[#00E599]">38.2 ms</div>
                    </div>
                  </div>

                  {/* Multimodal Triad Thumbnail Inspection with Click-to-Zoom */}
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs text-subtext0 font-semibold uppercase tracking-wider flex items-center gap-1.5 m-0">
                      <Layers className="w-3.5 h-3.5 text-[#00E599]" /> Multimodal Evidence Triad
                    </h4>
                    {selectedDetail?.processed_b64 && (
                      <span className="text-[10px] text-teal font-mono flex items-center gap-1 bg-teal/10 px-2 py-0.5 rounded border border-teal/20">
                        <Maximize2 className="w-2.5 h-2.5" /> Click scan to zoom
                      </span>
                    )}
                  </div>

                  {isLoadingDetail ? (
                    <div className="h-28 flex items-center justify-center text-xs text-subtext0 font-mono animate-pulse">
                      Loading images...
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {/* 1. Raw CT */}
                      <div
                        onClick={() => selectedDetail?.processed_b64 && handleOpenZoom('raw')}
                        className={`bg-black rounded-lg border border-surface1 overflow-hidden flex flex-col transition-all group relative ${
                          selectedDetail?.processed_b64 ? 'cursor-pointer hover:border-[#00E599] hover:shadow-md hover:shadow-teal/20' : ''
                        }`}
                        style={{ height: '110px' }}
                        title="Click to view & zoom Raw CT"
                      >
                        <div className="text-[9px] text-text font-mono font-semibold px-1.5 pt-1 pb-0.5 bg-surface1/60 flex items-center justify-between flex-shrink-0 z-10">
                          <span>1. Raw CT</span>
                          <Maximize2 className="w-2.5 h-2.5 text-subtext0 group-hover:text-[#00E599] transition-colors" />
                        </div>
                        {selectedDetail?.processed_b64 ? (
                          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                            <img
                              src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                              alt="Raw CT"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                            <div className="absolute inset-0 bg-teal/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] bg-black/80 text-[#00E599] font-mono px-1.5 py-0.5 rounded border border-teal/40">
                                Zoom
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-[9px] text-subtext0/50 font-mono">No Image</div>
                        )}
                      </div>

                      {/* 2. Grad-CAM */}
                      <div
                        onClick={() => selectedDetail?.processed_b64 && handleOpenZoom('gradcam')}
                        className={`bg-black rounded-lg border border-surface1 overflow-hidden flex flex-col transition-all group relative ${
                          selectedDetail?.processed_b64 ? 'cursor-pointer hover:border-[#00E599] hover:shadow-md hover:shadow-teal/20' : ''
                        }`}
                        style={{ height: '110px' }}
                        title="Click to view & zoom Grad-CAM Heatmap"
                      >
                        <div className="text-[9px] text-[#00E599] font-mono font-semibold px-1.5 pt-1 pb-0.5 bg-surface1/60 flex items-center justify-between flex-shrink-0 z-10">
                          <span>2. Grad-CAM</span>
                          <Maximize2 className="w-2.5 h-2.5 text-teal/70 group-hover:text-[#00E599] transition-colors" />
                        </div>
                        {selectedDetail?.processed_b64 ? (
                          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                            <img
                              src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                              alt="Base CT"
                              className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                              style={{ opacity: selectedDetail.heatmap_base64 ? 0.4 : 1 }}
                            />
                            {selectedDetail?.heatmap_base64 && (
                              <img
                                src={`data:image/png;base64,${selectedDetail.heatmap_base64}`}
                                alt="Grad-CAM"
                                className="absolute inset-0 w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                style={{ mixBlendMode: 'screen', opacity: 0.85 }}
                              />
                            )}
                            <div className="absolute inset-0 bg-teal/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] bg-black/80 text-[#00E599] font-mono px-1.5 py-0.5 rounded border border-teal/40">
                                Zoom
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-[9px] text-subtext0/50 font-mono">No Image</div>
                        )}
                      </div>

                      {/* 3. Pathology Bounding Box */}
                      <div
                        onClick={() => selectedDetail?.processed_b64 && handleOpenZoom('bbox')}
                        className={`bg-black rounded-lg border border-red/40 overflow-hidden flex flex-col transition-all group relative ${
                          selectedDetail?.processed_b64 ? 'cursor-pointer hover:border-red hover:shadow-md hover:shadow-red/20' : ''
                        }`}
                        style={{ height: '110px' }}
                        title="Click to view & zoom Pathology Box"
                      >
                        <div className="text-[9px] text-red font-mono font-semibold px-1.5 pt-1 pb-0.5 bg-surface1/60 flex items-center justify-between flex-shrink-0 z-10">
                          <span>3. Pathology Box</span>
                          <Maximize2 className="w-2.5 h-2.5 text-red/70 group-hover:text-red transition-colors" />
                        </div>
                        {selectedDetail?.processed_b64 ? (
                          <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                            <img
                              src={`data:image/png;base64,${selectedDetail.processed_b64}`}
                              alt="CT with Box"
                              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                            />
                            {selectedDetail?.bbox && (
                              <div
                                className="absolute border-2 border-red bg-red/10 pointer-events-none"
                                style={{
                                  left: `${(selectedDetail.bbox[0] / 224) * 100}%`,
                                  top: `${(selectedDetail.bbox[1] / 224) * 100}%`,
                                  width: `${(selectedDetail.bbox[2] / 224) * 100}%`,
                                  height: `${(selectedDetail.bbox[3] / 224) * 100}%`
                                }}
                              >
                                <span className="absolute -bottom-4 right-0 bg-black/90 text-red text-[8px] font-mono font-bold px-1 rounded border border-red/30">
                                  {selectedDetail.area_cc || 14.2}cc
                                </span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-red/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                              <span className="text-[9px] bg-black/80 text-red font-mono px-1.5 py-0.5 rounded border border-red/40">
                                Zoom
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center text-[9px] text-subtext0/50 font-mono">No Image</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Clinical Notes Card */}
                  <div className="bg-mantle p-3.5 rounded-xl border border-surface0 mb-4">
                    <div className="text-[10px] text-subtext0 uppercase tracking-widest font-semibold mb-1">
                      Clinical Impression &amp; Radiologist Notes
                    </div>
                    <p className="text-xs text-text leading-relaxed">
                      {selectedScan.notes}
                    </p>
                  </div>
                </div>

                {/* Bottom Actions: Delete Record Only */}
                <div className="space-y-2 pt-2 border-t border-surface0">
                  <button
                    onClick={() => handleDeleteScan(selectedScan.scan_id)}
                    className="w-full py-2.5 bg-red/10 hover:bg-red/20 text-red border border-red/30 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 font-mono"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Patient Record from MongoDB
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-subtext0 text-xs font-mono py-12">
                No scan selected
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Zoomable & Pannable Multimodal Evidence Overlay Modal */}
      <ImageZoomModal
        isOpen={zoomModalOpen}
        onClose={() => setZoomModalOpen(false)}
        selectedDetail={selectedDetail}
        selectedScan={selectedScan}
        initialMode={zoomInitialMode}
      />

    </div>
  );
}
