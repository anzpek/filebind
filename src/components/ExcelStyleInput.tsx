'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { VehicleData } from '@/types';
import { searchVehiclesByTerm } from '@/utils/searchUtils';

interface ExcelRow {
  id: string;
  searchTerm: string;
  selectedVehicle?: VehicleData;
  availableVehicles: VehicleData[];
  dropdownVisible: boolean;
  selectedIndex: number;
  isManualInputMode?: boolean;
}

interface ExcelStyleInputProps {
  vehicleData: VehicleData[];
  onRowsChange: (rows: ExcelRow[]) => void;
}

export default function ExcelStyleInput({ vehicleData, onRowsChange }: ExcelStyleInputProps) {
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [currentRowIndex, setCurrentRowIndex] = useState(0);
  const [dropdownPortalContainer, setDropdownPortalContainer] = useState<HTMLElement | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 120, left: '50%' });
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [manualInputModal, setManualInputModal] = useState<{isOpen: boolean, rowIndex: number} | null>(null);
  const [manualInputData, setManualInputData] = useState({
    accidentNumber: '',
    series: '',
    managementNumber: '',
    vehicleNumber: '',
    status: ''
  });
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 초기 행 생성
  useEffect(() => {
    if (rows.length === 0 && vehicleData.length > 0) {
      const initialRow: ExcelRow = {
        id: `row-${Date.now()}`,
        searchTerm: '',
        availableVehicles: [],
        dropdownVisible: false,
        selectedIndex: 0
      };
      setRows([initialRow]);
    }
  }, [vehicleData.length, rows.length]);

  // 포털 컨테이너 설정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDropdownPortalContainer(document.body);
    }
  }, []);

  // 부모 컴포넌트에 변경사항 전달
  useEffect(() => {
    onRowsChange(rows);
  }, [rows, onRowsChange]);

  // 중복된 사고번호 체크 함수
  const getDuplicateAccidentNumbers = useCallback(() => {
    const selectedVehicles = rows
      .filter(row => row.selectedVehicle)
      .map(row => row.selectedVehicle!);
    
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    
    selectedVehicles.forEach(vehicle => {
      if (seen.has(vehicle.accidentNumber)) {
        duplicates.add(vehicle.accidentNumber);
      } else {
        seen.add(vehicle.accidentNumber);
      }
    });
    
    return duplicates;
  }, [rows]);

  const addNewRow = useCallback(() => {
    const newRow: ExcelRow = {
      id: `row-${Date.now()}-${Math.random()}`,
      searchTerm: '',
      availableVehicles: [],
      dropdownVisible: false,
      selectedIndex: 0
    };
    
    setRows(prev => [...prev, newRow]);
    setCurrentRowIndex(prev => prev + 1);
    
    // 다음 프레임에서 새 행에 포커스 및 스크롤
    setTimeout(() => {
      const nextInput = inputRefs.current[rows.length];
      if (nextInput) {
        nextInput.focus();
        nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  }, [rows.length]);

  const selectVehicle = (rowIndex: number, vehicle: VehicleData) => {
    setActiveRowIndex(null); // 드롭다운 숨김
    setRows(prev => prev.map((row, index) => {
      if (index === rowIndex) {
        return {
          ...row,
          selectedVehicle: vehicle,
          dropdownVisible: false,
          availableVehicles: []
        };
      }
      return row;
    }));

    // 마지막 행이고 완료된 경우에만 새 행 추가
    if (rowIndex === rows.length - 1) {
      addNewRow();
    } else {
      // 다음 행으로 포커스 이동 및 스크롤
      setTimeout(() => {
        const nextInput = inputRefs.current[rowIndex + 1];
        if (nextInput) {
          nextInput.focus();
          nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 0);
    }
  };

  const handleManualInput = (rowIndex: number) => {
    const row = rows[rowIndex];
    // 검색어를 기반으로 초기값 설정
    setManualInputData({
      accidentNumber: row.searchTerm.includes('-') || /^\d{4}/.test(row.searchTerm) ? row.searchTerm : '',
      series: '',
      managementNumber: '',
      vehicleNumber: row.searchTerm.includes('-') || /^\d{4}/.test(row.searchTerm) ? '' : row.searchTerm,
      status: ''
    });
    
    // 드롭다운 닫기
    setActiveRowIndex(null);
    setRows(prev => prev.map((r, i) => {
      if (i === rowIndex) {
        return { ...r, dropdownVisible: false };
      }
      return r;
    }));
    
    // 모달 열기
    setManualInputModal({ isOpen: true, rowIndex });
  };

  const handleManualInputSave = () => {
    if (!manualInputModal) return;
    
    const manualVehicle: VehicleData = {
      no: Date.now(),
      accidentNumber: manualInputData.accidentNumber || 'MANUAL-' + Date.now(),
      series: manualInputData.series,
      managementNumber: manualInputData.managementNumber,
      vehicleNumber: manualInputData.vehicleNumber || 'MANUAL-' + Date.now(),
      status: manualInputData.status || '수동입력',
      closureDate: '',
      department: '',
      lastFourDigits: manualInputData.vehicleNumber.slice(-4) || '0000',
      manager: ''
    };
    
    selectVehicle(manualInputModal.rowIndex, manualVehicle);
    setManualInputModal(null);
  };

  const handleManualInputCancel = () => {
    setManualInputModal(null);
    setManualInputData({
      accidentNumber: '',
      series: '',
      managementNumber: '',
      vehicleNumber: '',
      status: ''
    });
  };

  const handleInputChange = (rowIndex: number, value: string) => {
    setRows(prev => prev.map((row, index) => {
      if (index === rowIndex) {
        // 선택된 차량이 있을 때 입력값이 변경되면 선택 취소
        if (row.selectedVehicle) {
          if (value.length >= 2) {
            const searchResults = searchVehiclesByTerm(vehicleData, value);
            const isDropdownVisible = searchResults.length > 0;
            
            if (isDropdownVisible) {
              setActiveRowIndex(rowIndex);
              // 드래그 중이 아닐 때만 위치 자동 계산
              if (!isDragging) {
                // 다음 프레임에서 위치 계산 (DOM 업데이트 후)
                requestAnimationFrame(() => {
                  const newPosition = calculateDropdownPosition(rowIndex);
                  setDropdownPosition(newPosition);
                });
              }
            }
            
            return {
              ...row,
              searchTerm: value,
              selectedVehicle: undefined,
              availableVehicles: searchResults,
              dropdownVisible: isDropdownVisible,
              selectedIndex: 0
            };
          } else {
            setActiveRowIndex(null);
            return {
              ...row,
              searchTerm: value,
              selectedVehicle: undefined,
              availableVehicles: [],
              dropdownVisible: false,
              selectedIndex: 0
            };
          }
        } else {
          // 선택된 차량이 없을 때의 기존 로직
          if (value.length >= 2) {
            const searchResults = searchVehiclesByTerm(vehicleData, value);
            // 검색 결과가 없어도 수동 입력 옵션을 위해 드롭다운 표시
            const isDropdownVisible = true;
            
            setActiveRowIndex(rowIndex);
            // 드래그 중이 아닐 때만 위치 자동 계산
            if (!isDragging) {
              // 다음 프레임에서 위치 계산 (DOM 업데이트 후)
              requestAnimationFrame(() => {
                const newPosition = calculateDropdownPosition(rowIndex);
                setDropdownPosition(newPosition);
              });
            }
            
            return {
              ...row,
              searchTerm: value,
              availableVehicles: searchResults,
              dropdownVisible: isDropdownVisible,
              selectedIndex: 0
            };
          } else {
            setActiveRowIndex(null);
            return {
              ...row,
              searchTerm: value,
              availableVehicles: [],
              dropdownVisible: false,
              selectedIndex: 0
            };
          }
        }
      }
      return row;
    }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    const row = rows[rowIndex];
    
    // 위/아래 키로 행간 이동 (드롭다운이 보이지 않을 때)
    if (!row.dropdownVisible) {
      if (e.key === 'ArrowUp' && rowIndex > 0) {
        e.preventDefault();
        const prevInput = inputRefs.current[rowIndex - 1];
        if (prevInput) {
          prevInput.focus();
          setCurrentRowIndex(rowIndex - 1);
          // 자동 스크롤
          prevInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      
      if (e.key === 'ArrowDown' && rowIndex < rows.length - 1) {
        e.preventDefault();
        const nextInput = inputRefs.current[rowIndex + 1];
        if (nextInput) {
          nextInput.focus();
          setCurrentRowIndex(rowIndex + 1);
          // 자동 스크롤
          nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      
      if (e.key === 'Enter' && row.searchTerm.length >= 2) {
        // 검색 결과가 없을 때 Enter 시 검색 재시도
        const searchResults = searchVehiclesByTerm(vehicleData, row.searchTerm);
        if (searchResults.length === 1) {
          selectVehicle(rowIndex, searchResults[0]);
        } else if (searchResults.length > 1) {
          setActiveRowIndex(rowIndex);
          // 드래그 중이 아닐 때만 위치 자동 계산
          if (!isDragging) {
            requestAnimationFrame(() => {
              const newPosition = calculateDropdownPosition(rowIndex);
              setDropdownPosition(newPosition);
            });
          }
          setRows(prev => prev.map((r, i) => {
            if (i === rowIndex) {
              return {
                ...r,
                availableVehicles: searchResults,
                dropdownVisible: true,
                selectedIndex: 0
              };
            }
            return r;
          }));
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setRows(prev => prev.map((r, i) => {
          if (i === rowIndex) {
            // 수동 입력 옵션까지 포함하여 네비게이션 (availableVehicles.length가 수동 입력 옵션 인덱스)
            const maxIndex = r.availableVehicles.length; // 수동 입력 옵션 포함
            const newIndex = r.selectedIndex < maxIndex 
              ? r.selectedIndex + 1 
              : r.selectedIndex;
            
            // 드롭다운 스크롤 처리
            setTimeout(() => {
              const dropdown = document.querySelector(`[data-dropdown-row="${rowIndex}"]`);
              const itemSelector = newIndex === r.availableVehicles.length 
                ? `[data-dropdown-item="${rowIndex}-manual"]`
                : `[data-dropdown-item="${rowIndex}-${newIndex}"]`;
              const selectedItem = document.querySelector(itemSelector);
              if (dropdown && selectedItem) {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }, 0);
            
            return {
              ...r,
              selectedIndex: newIndex
            };
          }
          return r;
        }));
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setRows(prev => prev.map((r, i) => {
          if (i === rowIndex) {
            const newIndex = r.selectedIndex > 0 ? r.selectedIndex - 1 : 0;
            
            // 드롭다운 스크롤 처리
            setTimeout(() => {
              const dropdown = document.querySelector(`[data-dropdown-row="${rowIndex}"]`);
              const itemSelector = newIndex === r.availableVehicles.length 
                ? `[data-dropdown-item="${rowIndex}-manual"]`
                : `[data-dropdown-item="${rowIndex}-${newIndex}"]`;
              const selectedItem = document.querySelector(itemSelector);
              if (dropdown && selectedItem) {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            }, 0);
            
            return {
              ...r,
              selectedIndex: newIndex
            };
          }
          return r;
        }));
        break;
        
      case 'Enter':
        e.preventDefault();
        if (row.selectedIndex === row.availableVehicles.length) {
          // 수동 입력 선택
          handleManualInput(rowIndex);
        } else if (row.availableVehicles[row.selectedIndex]) {
          selectVehicle(rowIndex, row.availableVehicles[row.selectedIndex]);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setActiveRowIndex(null);
        setRows(prev => prev.map((r, i) => {
          if (i === rowIndex) {
            return { ...r, dropdownVisible: false };
          }
          return r;
        }));
        break;
    }
  };

  const handleInputFocus = (rowIndex: number) => {
    setCurrentRowIndex(rowIndex);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter((_, i) => i !== rowIndex));
      if (currentRowIndex >= rows.length - 1) {
        setCurrentRowIndex(Math.max(0, rows.length - 2));
      }
    }
  };

  const clearRow = (rowIndex: number) => {
    setActiveRowIndex(null);
    setRows(prev => prev.map((row, index) => {
      if (index === rowIndex) {
        return {
          ...row,
          searchTerm: '',
          selectedVehicle: undefined,
          availableVehicles: [],
          dropdownVisible: false,
          selectedIndex: 0
        };
      }
      return row;
    }));
    
    // 해당 입력 필드에 포커스
    const input = inputRefs.current[rowIndex];
    if (input) {
      input.focus();
    }
  };

  // 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartPos({
      x: e.clientX - (typeof dropdownPosition.left === 'number' ? dropdownPosition.left : 0),
      y: e.clientY - dropdownPosition.top
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newLeft = e.clientX - dragStartPos.x;
    const newTop = e.clientY - dragStartPos.y;
    
    // 화면 경계 제한
    const maxLeft = window.innerWidth - 420; // 드롭다운 폭 420px
    const minLeft = 0;
    const maxTop = window.innerHeight - 400; // 최소 여백
    const minTop = 0;
    
    setDropdownPosition({
      left: `${Math.max(minLeft, Math.min(maxLeft, newLeft))}px`,
      top: Math.max(minTop, Math.min(maxTop, newTop))
    });
  }, [isDragging, dragStartPos]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 전역 마우스 이벤트 리스너
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 입력 필드 기준으로 드롭다운 위치 계산
  const calculateDropdownPosition = useCallback((rowIndex: number) => {
    const inputElement = inputRefs.current[rowIndex];
    if (!inputElement) return { top: 120, left: '50%' };
    
    const rect = inputElement.getBoundingClientRect();
    
    // viewport 기준 위치 사용 (고정 위치)
    return {
      top: rect.bottom + 5, // 입력 필드 바로 아래 + 5px 여백
      left: `${rect.left}px`
    };
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">엑셀 스타일 입력</h2>
        <div className="text-sm text-gray-600">
          A열에 입력 후 Enter키를 누르세요
        </div>
      </div>

      {vehicleData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          먼저 차량 데이터를 업로드해주세요.
        </div>
      )}

      {vehicleData.length > 0 && (
        <div className="overflow-x-auto">
          {/* 헤더 */}
          <div className="grid grid-cols-6 gap-2 mb-4 bg-blue-50 p-3 rounded-lg font-semibold text-gray-700">
            <div className="text-center">4자리입력</div>
            <div className="text-center">사고번호</div>
            <div className="text-center">서열</div>
            <div className="text-center">관리번호</div>
            <div className="text-center">피해자(물)</div>
            <div className="text-center">상태</div>
          </div>

          {/* 데이터 행들 */}
          <div className="space-y-2 relative">
            {rows.map((row, rowIndex) => {
              const duplicateAccidentNumbers = getDuplicateAccidentNumbers();
              const isDuplicate = row.selectedVehicle && duplicateAccidentNumbers.has(row.selectedVehicle.accidentNumber);
              
              return (
                <div key={row.id} className="relative">
                  <div className={`grid grid-cols-6 gap-2 border rounded-lg p-2 ${
                    isDuplicate ? 'border-red-400 bg-red-50' : 'border-gray-200'
                  }`}>
                  {/* 우측 여백에 중복 경고 */}
                  {isDuplicate && (
                    <div className="absolute -right-24 top-2 text-red-600 text-sm font-bold">
                      ⚠️ 중복!
                    </div>
                  )}
                  {/* A열: 입력 필드 */}
                  <div className="relative">
                    <input
                      ref={el => { inputRefs.current[rowIndex] = el; }}
                      type="text"
                      value={row.selectedVehicle ? row.selectedVehicle.vehicleNumber : row.searchTerm}
                      onChange={(e) => handleInputChange(rowIndex, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, rowIndex)}
                      onFocus={() => handleInputFocus(rowIndex)}
                      placeholder="피해물 또는 사고번호"
                      className={`w-full px-2 py-1 border rounded text-center text-sm ${
                        row.selectedVehicle ? 'bg-green-50 border-green-300' : 'border-gray-300'
                      }`}
                      style={{ fontSize: '13px' }}
                    />
                    
                    {/* 드롭다운을 포털로 렌더링 */}
                  </div>

                  {/* B~F열: 자동 채워지는 필드들 */}
                  <div className="text-center py-1 px-2 bg-gray-50 rounded">
                    {row.selectedVehicle?.accidentNumber || ''}
                  </div>
                  <div className="text-center py-1 px-2 bg-gray-50 rounded">
                    {row.selectedVehicle?.series || ''}
                  </div>
                  <div className="text-center py-1 px-2 bg-gray-50 rounded">
                    {row.selectedVehicle?.managementNumber || ''}
                  </div>
                  <div className={`text-center py-1 px-2 rounded ${
                    isDuplicate ? 'bg-red-100 text-red-700 font-bold' : 'bg-gray-50'
                  }`}>
                    {row.selectedVehicle?.vehicleNumber || ''}
                  </div>
                  <div className="text-center py-1 px-2 bg-gray-50 rounded">
                    {row.selectedVehicle?.status || ''}
                  </div>
                </div>

                {/* 행 관리 버튼들 */}
                <div className="absolute -right-16 top-1/2 transform -translate-y-1/2 flex flex-col gap-1">
                  {row.selectedVehicle && (
                    <button
                      onClick={() => clearRow(rowIndex)}
                      className="text-yellow-600 hover:text-yellow-800 text-sm"
                      title="초기화"
                    >
                      🔄
                    </button>
                  )}
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(rowIndex)}
                      className="text-red-500 hover:text-red-700 text-lg"
                      title="삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 상태 표시 */}
      {rows.length > 0 && (
        <div className="mt-6">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-blue-700">
                총 {rows.length}개 행 중 {rows.filter(r => r.selectedVehicle).length}개 완료
              </span>
              <div className="flex items-center gap-4 text-xs text-blue-600">
                <span>Enter: 확인</span>
                <span>↑↓: 행이동/선택</span>
                <span>Esc: 취소</span>
                <span>🔄: 초기화</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 포털로 렌더링되는 드롭다운들 */}
      {dropdownPortalContainer && rows.map((row, rowIndex) => 
        row.dropdownVisible && rowIndex === activeRowIndex && (
          createPortal(
            <div 
              key={`dropdown-${rowIndex}`}
              className="fixed z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-y-auto"
              data-dropdown-row={rowIndex}
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                transform: 'none',
                width: '420px',
                maxHeight: row.availableVehicles.length === 0 
                  ? '140px' // 수동 입력만 있을 때
                  : row.availableVehicles.length <= 5 
                    ? `${Math.max(row.availableVehicles.length * 70 + (row.availableVehicles.length > 1 ? 45 : 0) + 70, 140)}px` // +70px for manual input
                    : `${5 * 70 + 45 + 70}px` // 5개 * 70px + 헤더 45px + 수동입력 70px
              }}
            >
              {row.availableVehicles.length > 1 && (
                <div 
                  className="px-4 py-3 bg-gray-50 border-b text-sm text-gray-700 sticky top-0 z-10 cursor-move select-none"
                  onMouseDown={handleMouseDown}
                  title="드래그하여 이동"
                >
                  <span className="font-medium">{row.availableVehicles.length}개 결과 - ↑↓ 키로 선택, Enter로 확인 📌</span>
                </div>
              )}
              
              {row.availableVehicles.length === 0 && (
                <div className="px-4 py-3 bg-gray-50 border-b text-sm text-gray-600 sticky top-0 z-10">
                  <span className="font-medium">검색 결과가 없습니다 - 아래 수동 입력을 이용하세요</span>
                </div>
              )}
              
              {row.availableVehicles.map((vehicle, index) => (
                <div
                  key={`${vehicle.vehicleNumber}-${index}`}
                  data-dropdown-item={`${rowIndex}-${index}`}
                  onClick={() => selectVehicle(rowIndex, vehicle)}
                  className={`px-4 py-3 cursor-pointer border-b border-gray-100 ${
                    index === row.selectedIndex ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                  }`}
                  style={{ minHeight: '70px' }}
                >
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-gray-800 text-base">
                      {vehicle.vehicleNumber}
                    </div>
                    <div className="text-sm text-gray-600">
                      사고번호: {vehicle.accidentNumber}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* 수동 입력 옵션 */}
              <div
                data-dropdown-item={`${rowIndex}-manual`}
                onClick={() => handleManualInput(rowIndex)}
                className={`px-4 py-3 cursor-pointer border-t-2 border-blue-200 bg-blue-50 hover:bg-blue-100 ${
                  row.selectedIndex === row.availableVehicles.length ? 'bg-blue-100 border-blue-300' : ''
                }`}
                style={{ minHeight: '70px' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-600 font-semibold">✏️ 수동 입력</span>
                    <span className="text-sm text-blue-600">
                      "{row.searchTerm}" 직접 추가
                    </span>
                  </div>
                  <div className="text-xs text-blue-500">
                    Enter 또는 클릭
                  </div>
                </div>
              </div>
            </div>,
            dropdownPortalContainer
          )
        )
      )}

      {/* 수동 입력 모달 */}
      {manualInputModal?.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-lg mx-4">
            <h3 className="text-lg font-semibold mb-4">수동 데이터 입력</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  사고번호
                </label>
                <input
                  type="text"
                  value={manualInputData.accidentNumber}
                  onChange={(e) => setManualInputData(prev => ({ ...prev, accidentNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="예: 07-202502-01130"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  서열
                </label>
                <input
                  type="text"
                  value={manualInputData.series}
                  onChange={(e) => setManualInputData(prev => ({ ...prev, series: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="예: 001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  관리번호
                </label>
                <input
                  type="text"
                  value={manualInputData.managementNumber}
                  onChange={(e) => setManualInputData(prev => ({ ...prev, managementNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="관리번호 입력"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  피해자(물) *
                </label>
                <input
                  type="text"
                  value={manualInputData.vehicleNumber}
                  onChange={(e) => setManualInputData(prev => ({ ...prev, vehicleNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="예: 84주7365, 자전거, 보행자"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상태
                </label>
                <select
                  value={manualInputData.status}
                  onChange={(e) => setManualInputData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">상태 선택</option>
                  <option value="종결">종결</option>
                  <option value="진행중">진행중</option>
                  <option value="보류">보류</option>
                  <option value="수동입력">수동입력</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleManualInputCancel}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleManualInputSave}
                disabled={!manualInputData.vehicleNumber.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}