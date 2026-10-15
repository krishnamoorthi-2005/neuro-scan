import { createContext, useState } from 'react';

export const NeuroScanContext = createContext();

export function NeuroScanProvider({ children }) {
  // Current Active Diagnostic Session (Screen 2)
  const [currentScan, setCurrentScan] = useState(null);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [isInferencing, setIsInferencing] = useState(false);
  const [viewPlane, setViewPlane] = useState('axial'); // 'axial' | 'coronal' | 'sagittal'

  // Archive & Database State (Screen 3)
  const [registryRecords, setRegistryRecords] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'STROKE' | 'ICH' | 'NORMAL' | 'REJECTED'
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <NeuroScanContext.Provider value={{
      currentScan, setCurrentScan,
      inferenceResult, setInferenceResult,
      isInferencing, setIsInferencing,
      viewPlane, setViewPlane,
      registryRecords, setRegistryRecords,
      selectedPatient, setSelectedPatient,
      activeFilter, setActiveFilter,
      searchQuery, setSearchQuery
    }}>
      {children}
    </NeuroScanContext.Provider>
  );
}
