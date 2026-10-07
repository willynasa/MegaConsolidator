import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Settings, Play, FileSpreadsheet, Plus, Trash2, List, AlignLeft, Table, AlertCircle, BookOpen, HelpCircle, ArrowLeft, X, Globe, FileText, Download } from "lucide-react";
import "./App.css";

type ScenarioType = "default" | "transpose" | "custom_headers";

interface Scenario {
  id: string;
  type: ScenarioType;
  sheetName: string;
  columns: string;
  headerRow: number | "";
  numRows: number | ""; // For default scenario
  outputSheetName: string;
  customNames?: string;
  fillnaVal?: string;
  excludeCol?: string;
  excludeVal?: string;
}

interface AppConfig {
  sourceDir: string;
  destDir: string;
  outputFileName: string;
  globalRefSheet: string;
  globalRefCell: string;
  scenarios: Scenario[];
  csvSourceDir?: string;
  csvDestDir?: string;
  csvOutputName?: string;
  csvEncoding?: string;
  csvOutputFormat?: string;
  csvFillVal?: string;
  csvExcludeCol?: string;
  csvExcludeVal?: string;
}

function App() {
  const [sourceDir, setSourceDir] = useState("");
  const [destDir, setDestDir] = useState("");
  const [outputFileName, setOutputFileName] = useState("Merged_Data");
  const [globalRefSheet, setGlobalRefSheet] = useState("");
  const [globalRefCell, setGlobalRefCell] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [scenarios, setScenarios] = useState<Scenario[]>([
    {
      id: crypto.randomUUID(),
      type: "default",
      sheetName: "Sheet1",
      columns: "A:Z",
      headerRow: 1,
      numRows: "",
      outputSheetName: "Dataset1",
    }
  ]);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready to process");
  const [isRunning, setIsRunning] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  const [activeTab, setActiveTab] = useState<"excel" | "csv">("excel");
  const [csvSourceDir, setCsvSourceDir] = useState("");
  const [csvDestDir, setCsvDestDir] = useState("");
  const [csvOutputName, setCsvOutputName] = useState("Consolidated_CSV");
  const [csvEncoding, setCsvEncoding] = useState("utf-8");
  const [csvOutputFormat, setCsvOutputFormat] = useState("xlsx");
  const [csvFillVal, setCsvFillVal] = useState("");
  const [csvExcludeCol, setCsvExcludeCol] = useState("");
  const [csvExcludeVal, setCsvExcludeVal] = useState("");

  // Load config on mount
  useEffect(() => {
    // Attempt to load settings from Rust backend
    invoke("load_config").then((savedConfig: any) => {
      if (savedConfig) {
        setSourceDir(savedConfig.sourceDir || "");
        setDestDir(savedConfig.destDir || "");
        setOutputFileName(savedConfig.outputFileName || "Merged_Data");
        setGlobalRefSheet(savedConfig.globalRefSheet || "");
        setGlobalRefCell(savedConfig.globalRefCell || "");
        if (savedConfig.scenarios && savedConfig.scenarios.length > 0) {
          setScenarios(savedConfig.scenarios);
        }
        if (savedConfig.csvSourceDir) setCsvSourceDir(savedConfig.csvSourceDir);
        if (savedConfig.csvDestDir) setCsvDestDir(savedConfig.csvDestDir);
        if (savedConfig.csvOutputName) setCsvOutputName(savedConfig.csvOutputName);
        if (savedConfig.csvEncoding) setCsvEncoding(savedConfig.csvEncoding);
        if (savedConfig.csvOutputFormat) setCsvOutputFormat(savedConfig.csvOutputFormat);
        if (savedConfig.csvFillVal) setCsvFillVal(savedConfig.csvFillVal);
        if (savedConfig.csvExcludeCol) setCsvExcludeCol(savedConfig.csvExcludeCol);
        if (savedConfig.csvExcludeVal) setCsvExcludeVal(savedConfig.csvExcludeVal);
      }
    }).catch((e) => console.log("No existing config found or error loading.", e))
      .finally(() => {
        // Add a slight delay for the splash screen
        setTimeout(() => {
          setShowSplash(false);
        }, 1500);
      });
  }, []);

  // Auto-save config when any setting changes
  useEffect(() => {
    const config: AppConfig = {
      sourceDir,
      destDir,
      outputFileName,
      globalRefSheet,
      globalRefCell,
      scenarios,
      csvSourceDir,
      csvDestDir,
      csvOutputName,
      csvEncoding,
      csvOutputFormat,
      csvFillVal,
      csvExcludeCol,
      csvExcludeVal
    };
    
    // Debounce the save slightly so we don't spam the backend on every keystroke
    const timer = setTimeout(() => {
      invoke("save_config", { config }).catch(e => console.error("Failed to save config:", e));
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [sourceDir, destDir, outputFileName, globalRefSheet, globalRefCell, scenarios, csvSourceDir, csvDestDir, csvOutputName, csvEncoding, csvOutputFormat, csvFillVal, csvExcludeCol, csvExcludeVal]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectFolder = async (isSource: boolean) => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        if (activeTab === 'csv') {
          if (isSource) setCsvSourceDir(selected);
          else setCsvDestDir(selected);
        } else {
          if (isSource) setSourceDir(selected);
          else setDestDir(selected);
        }
      }
    } catch (e) {
      console.error("Failed to open dialog", e);
    }
  };

  const addScenario = (type: ScenarioType) => {
    setScenarios([...scenarios, {
      id: crypto.randomUUID(),
      type,
      sheetName: "Sheet1",
      columns: "",
      headerRow: 1,
      numRows: "",
      outputSheetName: `Dataset_${scenarios.length + 1}`,
    }]);
    setIsDropdownOpen(false);
  };

  const removeScenario = (id: string) => {
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const updateScenario = (id: string, field: keyof Scenario, value: any) => {
    setScenarios(scenarios.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const getColumnCount = (colString: string): number => {
    if (!colString.trim()) return 0;
    
    const colToNum = (col: string) => {
      let num = 0;
      const upperCol = col.trim().toUpperCase();
      for (let i = 0; i < upperCol.length; i++) {
        num = num * 26 + (upperCol.charCodeAt(i) - 64);
      }
      return num;
    };

    let total = 0;
    const parts = colString.split(',');
    for (const part of parts) {
      if (part.includes(':')) {
        const [start, end] = part.split(':');
        if (start && end) {
          total += (colToNum(end) - colToNum(start) + 1);
        }
      } else {
        if (part.trim()) total += 1;
      }
    }
    return total;
  };

  const validateRun = (): boolean => {
    setErrorMsg("");

    if (activeTab === "csv") {
      if (!csvSourceDir) {
        setErrorMsg("Please select a Source Folder.");
        return false;
      }
      if (!csvDestDir) {
        setErrorMsg("Please select a Destination Folder.");
        return false;
      }
      return true;
    }

    // 1. Global Reference check
    if ((globalRefSheet && !globalRefCell) || (!globalRefSheet && globalRefCell)) {
      setErrorMsg("Global Reference error: You must provide both the Sheet name and the Cell, or leave both empty.");
      return false;
    }

    // 2. Output sheet uniqueness check
    const names = scenarios.map(s => s.outputSheetName.trim().toLowerCase());
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      setErrorMsg("Output Sheet Name error: Every scenario must have a unique Output Sheet Name.");
      return false;
    }

    // 3. Custom Headers check
    for (const s of scenarios) {
      if (s.type === "custom_headers") {
        const selectedCount = getColumnCount(s.columns);
        const customNamesCount = s.customNames ? s.customNames.split(',').filter(n => n.trim() !== "").length : 0;
        
        if (selectedCount > 0 && customNamesCount !== selectedCount) {
          setErrorMsg(`Custom Headers error in '${s.outputSheetName}': You selected ${selectedCount} columns to extract, but provided ${customNamesCount} custom header names. They must match exactly.`);
          return false;
        }
      }
    }

    return true;
  };

  const handleRun = async () => {
    if (!validateRun()) return;

    setIsRunning(true);
    setStatus("Processing files...");
    setProgress(10);
    
    try {
      if (activeTab === "excel") {
        // Sanitize payload: convert "" to null for Rust Option<usize> fields
        const sanitizedScenarios = scenarios.map(s => ({
          ...s,
          headerRow: s.headerRow === "" ? null : s.headerRow,
          numRows: s.numRows === "" ? null : s.numRows
        }));

        const config: AppConfig = {
          sourceDir,
          destDir,
          outputFileName,
          globalRefSheet,
          globalRefCell,
          scenarios: sanitizedScenarios as any
        };
        
        setProgress(50);
        await invoke("run_consolidation", { config });
      } else {
        const config: AppConfig = {
          sourceDir: csvSourceDir,
          destDir: csvDestDir,
          outputFileName: csvOutputName,
          globalRefSheet: "",
          globalRefCell: "",
          scenarios: [],
          csvSourceDir,
          csvDestDir,
          csvOutputName,
          csvEncoding,
          csvOutputFormat,
          csvFillVal,
          csvExcludeCol,
          csvExcludeVal
        };
        setProgress(50);
        await invoke("run_csv_consolidation", { config });
      }
      
      setProgress(100);
      setStatus("Completed successfully!");
    } catch (e) {
      console.error(e);
      setErrorMsg(String(e));
      setStatus("Failed");
      setProgress(0);
    } finally {
      setIsRunning(false);
    }
  };

  const renderScenarioSettings = (scenario: Scenario) => {
    return (
      <div className="scenario-body">
        <div className="form-group">
          <label>Target Sheet Name</label>
          <input 
            type="text" 
            className="input-control" 
            value={scenario.sheetName}
            onChange={(e) => updateScenario(scenario.id, 'sheetName', e.target.value)}
            placeholder="Sheet1" 
          />
        </div>
        
        <div className="form-group">
          <label>Output Sheet Name (Must be unique)</label>
          <input 
            type="text" 
            className="input-control" 
            value={scenario.outputSheetName}
            onChange={(e) => updateScenario(scenario.id, 'outputSheetName', e.target.value)}
            placeholder="Dataset1" 
          />
        </div>

        <div className="form-group">
          <label>
            {scenario.type === "transpose" 
              ? "Columns Pair to Extract (e.g. A:B)" 
              : "Columns to Extract (e.g. A:D, F)"}
          </label>
          <input 
            type="text" 
            className="input-control" 
            value={scenario.columns}
            onChange={(e) => updateScenario(scenario.id, 'columns', e.target.value)}
            placeholder="e.g. A:B" 
          />
        </div>

        {scenario.type === "default" && (
          <>
            <div className="form-group">
              <label>Header Row Number (e.g. 1)</label>
              <input 
                type="number" 
                className="input-control" 
                value={scenario.headerRow}
                onChange={(e) => updateScenario(scenario.id, 'headerRow', e.target.value ? parseInt(e.target.value) : "")}
                min="1"
              />
            </div>
            <div className="form-group">
              <label>Number of Data Rows to Extract</label>
              <input 
                type="number" 
                className="input-control" 
                value={scenario.numRows}
                onChange={(e) => updateScenario(scenario.id, 'numRows', e.target.value ? parseInt(e.target.value) : "")}
                placeholder="Auto-detect all rows" 
                min="1"
              />
            </div>
          </>
        )}

        {scenario.type === "custom_headers" && (
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label>Custom Header Names (comma separated)</label>
            <input 
              type="text" 
              className="input-control" 
              value={scenario.customNames || ""}
              onChange={(e) => updateScenario(scenario.id, 'customNames', e.target.value)}
              placeholder="Col1, Col2, Col3" 
            />
          </div>
        )}

        {/* Cleaning Options */}
        {scenario.type !== "transpose" && (
          <div className="form-group">
            <label>Fill Empty Cells with Value</label>
            <input 
              type="text" 
              className="input-control" 
              value={scenario.fillnaVal || ""}
              onChange={(e) => updateScenario(scenario.id, 'fillnaVal', e.target.value)}
              placeholder="e.g. 0" 
            />
          </div>
        )}

        <div className="form-group">
          <label>
            {scenario.type === "transpose" 
              ? "Exclude rows where label is" 
              : "Exclude rows where Column..."}
          </label>
          <input 
            type="text" 
            className="input-control" 
            value={scenario.excludeCol || ""}
            onChange={(e) => updateScenario(scenario.id, 'excludeCol', e.target.value)}
            placeholder={
              scenario.type === "transpose"
                ? "e.g. Total"
                : scenario.type === "custom_headers" ? "e.g. A" : "e.g. Status"
            } 
          />
        </div>

        {scenario.type !== "transpose" && (
          <div className="form-group">
            <label>...Equals Value</label>
            <input 
              type="text" 
              className="input-control" 
              value={scenario.excludeVal || ""}
              onChange={(e) => updateScenario(scenario.id, 'excludeVal', e.target.value)}
              placeholder="e.g. Total" 
            />
          </div>
        )}
      </div>
    );
  };

  const getScenarioIcon = (type: ScenarioType) => {
    switch (type) {
      case "default": return <Table size={18} />;
      case "transpose": return <List size={18} />;
      case "custom_headers": return <AlignLeft size={18} />;
    }
  };

  const getScenarioTitle = (type: ScenarioType) => {
    switch (type) {
      case "default": return "Default Column Headers";
      case "transpose": return "Label/Value Pairs (Transpose)";
      case "custom_headers": return "Custom Header Values";
    }
  };

  if (showSplash) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#f0f2f5', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999, color: '#1e293b', fontFamily: 'var(--font-family)'
      }}>
        <div style={{
          background: '#ffffff', padding: '3rem 4rem', borderRadius: '16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center'
        }}>
          <img src="/CombinatorIcon.png" alt="App Logo" style={{ width: 48, height: 48 }} />
          <h2 style={{ margin: '0', color: '#0f172a', fontSize: '1.75rem', fontWeight: 700 }}>MegaConsolidator</h2>
          <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 5px 0' }}><strong>Version:</strong> 1.0.0</p>
            <p style={{ margin: '0' }}><strong>Date:</strong> August 2026</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6', fontWeight: 500 }}>
            <div style={{
              width: '20px', height: '20px', border: '3px solid rgba(59,130,246,0.3)',
              borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite'
            }}></div>
            Initializing core engine...
          </div>
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (showHowTo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '1.5rem', gap: '1.5rem', overflow: 'hidden' }}>
        <header className="header glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => setShowHowTo(false)} style={{ padding: '0.5rem 1rem' }}>
            <ArrowLeft size={18} /> Back
          </button>
          <div className="header-title" style={{ margin: 0 }}>
            <BookOpen size={24} className="icon-logo" />
            <h1>User Guide</h1>
          </div>
        </header>

        <div className="glass-panel main-scroll-area" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', lineHeight: '1.6', flex: 1, overflowY: 'auto' }}>
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>How to use MegaConsolidator</h2>
          <p>This tool merges data from multiple files into a single, clean master file. Use the Sidebar on the left to switch between processing Excel files and CSV files.</p>
          
          <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}><Globe size={18} /> Automatic Global Columns</h3>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '0.5rem' }}><strong>File Name:</strong> For every scenario (Excel or CSV), the engine will automatically add a "File Name" column as the first column so you always know exactly which source file the data came from.</li>
              <li><strong>Global Reference Value (Excel Only):</strong> If you specify a Global Reference Sheet and Cell in the General Configuration (e.g., Sheet: "Master", Cell: "B2"), the engine will extract that exact cell's value from every file and repeat it on the second column to your final dataset. This is perfect for pulling a master date, client name, or invoice number that applies to all data inside that file.</li>
            </ul>
          </div>

          <h2 style={{ color: 'var(--primary)', margin: '1rem 0 0.5rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>Excel File Consolidation (.xlsx, .xlsm, .xlsb, .xls)</h2>
          <p style={{ margin: '0 0 0.5rem 0' }}>You define exactly what data you want to pull from Excel sheets using <strong>Scenarios</strong>.</p>

          <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}><Table size={18} /> Default Column Headers</h3>
            <p style={{ margin: '0 0 0.5rem 0' }}>Use this when your files contain standard tables with column headers at the top.</p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
              <li><strong>How it works:</strong> The engine scans the header row, finds the columns you requested, and pulls all rows beneath them.</li>
              <li><strong>Excluding data:</strong> You can drop rows based on a specific column's value. You can exclude multiple values at once using <code>||</code> (e.g., 'Void || Cancelled').</li>
            </ul>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}><List size={18} /> Label/Value Pairs (Transpose)</h3>
            <p style={{ margin: '0 0 0.5rem 0' }}>Use this for forms or invoices where data is vertical (e.g. "Invoice Number:" next to "12345").</p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
              <li><strong>How it works:</strong> You provide the column containing labels and the column containing values (e.g. A:B). The engine automatically flips (transposes) the labels into column headers, and puts the values in a single row per file.</li>
            </ul>
          </div>

          <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}><AlignLeft size={18} /> Custom Header Values</h3>
            <p style={{ margin: '0 0 0.5rem 0' }}>Use this when your data table has no headers at all, but you know exactly which columns you want.</p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
              <li><strong>How it works:</strong> You specify the column letters (e.g., A, C, F) and provide custom names for them (e.g., Date, Amount, Client). The final dataset will use your custom names as the headers.</li>
              <li><strong>Excluding data:</strong> You can drop rows based on a specific column's value. You can exclude multiple values at once using <code>||</code> (e.g., 'Void || Cancelled').</li>
            </ul>
          </div>

          <h2 style={{ color: 'var(--primary)', margin: '1rem 0 0.5rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>CSV File Consolidation (.csv)</h2>
          <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}><FileText size={18} /> Zero-Friction Extraction</h3>
            <p style={{ margin: '0 0 0.5rem 0' }}>CSV files are flat text files without sheets or explicit data types. The MegaConsolidator treats them dynamically.</p>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)' }}>
              <li style={{ marginBottom: '0.5rem' }}><strong>Auto-Detection:</strong> The engine automatically finds the header row (ignoring preceding empty rows), reads every single column, and extracts all rows.</li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Dummy Columns:</strong> If a CSV file lacks headers entirely, the engine will automatically generate them (e.g., Column1, Column2) so no data is lost.</li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Excluding data:</strong> You can drop rows based on a specific column's value. You can exclude multiple values at once using <code>||</code> (e.g., 'Void || Cancelled').</li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Encoding:</strong> Because CSVs can be saved in different languages and formats, you can select the <strong>Input Encoding</strong> (like UTF-8 or Windows-1252) so special characters display correctly.</li>
              <li><strong>Flexible Output:</strong> You can choose to output the final merged dataset as a safe Excel Workbook (.xlsx) or back into a giant CSV file.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-title">
          <img src="/CombinatorIcon.png" alt="App Logo" className="icon-logo" style={{ width: 28, height: 28 }} />
          Consolidator
        </div>
        <div className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'excel' ? 'active' : ''}`} onClick={() => setActiveTab('excel')}>
            <FileSpreadsheet size={20} /> Excel files
          </button>
          <button className={`nav-item ${activeTab === 'csv' ? 'active' : ''}`} onClick={() => setActiveTab('csv')}>
            <FileText size={20} /> CSV files
          </button>
        </div>
      </aside>

      <main className="main-container">
        {showAbout && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
          }}>
            <div style={{
              background: 'var(--bg-surface)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--border-color)',
              width: '400px', maxWidth: '90%', position: 'relative', boxShadow: 'var(--shadow-lg)'
            }}>
              <button 
                onClick={() => setShowAbout(false)}
                style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
              <div style={{ textAlign: 'center', padding: '10px 0 20px 0' }}>
                <h2 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '1.5rem' }}>MegaConsolidator</h2>
                <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}><strong>Version:</strong> 1.0.0</p>
                <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)' }}><strong>Date:</strong> August 2026</p>
                
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}><strong>Developer:</strong> Wili sever Ciobotea</p>
                  <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    This software is released under the GNU General Public License.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      {activeTab === 'excel' ? (
        <header className="header glass-panel">
          <div className="header-title">
            <FileSpreadsheet size={28} className="icon-logo" />
            <h1>Excel Data Consolidator</h1>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Supported formats: .xlsx, .xlsm, .xlsb, .xls
          </div>
        </header>
      ) : (
        <header className="header glass-panel">
          <div className="header-title">
            <FileText size={28} className="icon-logo" />
            <h1>CSV Data Consolidator</h1>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Supported formats: .csv
          </div>
        </header>
      )}

      {errorMsg && (
        <div className="glass-panel" style={{ margin: '0 2rem', padding: '1rem', borderLeft: '4px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.95)', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.2)', zIndex: 10 }}>
          <AlertCircle color="#ef4444" size={20} />
          <span style={{ color: '#fee2e2', fontWeight: 500 }}>{errorMsg}</span>
        </div>
      )}

      <div className="main-scroll-area">

        {activeTab === "excel" ? (
          <>
            {/* Excel General Configuration */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 className="section-title" style={{ margin: 0 }}>
                  <Settings size={20} className="icon-logo" /> General Configuration
                </h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setShowHowTo(true)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <BookOpen size={22} />
                    How To
                  </button>
                  <button onClick={() => setShowAbout(true)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <HelpCircle size={22} />
                    About
                  </button>
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="config-grid">
                  <div className="form-group">
                    <label>Source Folder (Input Excel Files)</label>
                    <div className="folder-select-group">
                      <input type="text" className="input-control" value={sourceDir} readOnly placeholder="Select folder..." />
                      <button className="btn btn-secondary" onClick={() => selectFolder(true)}>
                        <FolderOpen size={18} /> Browse
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Destination Folder (Output Location)</label>
                    <div className="folder-select-group">
                      <input type="text" className="input-control" value={destDir} readOnly placeholder="Select folder..." />
                      <button className="btn btn-secondary" onClick={() => selectFolder(false)}>
                        <FolderOpen size={18} /> Browse
                      </button>
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Output Filename (auto-appends datetime stamp)</label>
                    <input 
                      type="text" 
                      className="input-control" 
                      value={outputFileName}
                      onChange={(e) => setOutputFileName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)' }}></div>

                <div className="config-grid">
                  <div className="form-group">
                    <label>Global Reference Sheet (Optional)</label>
                    <input 
                      type="text" 
                      className="input-control" 
                      value={globalRefSheet}
                      onChange={(e) => setGlobalRefSheet(e.target.value)}
                      placeholder="e.g. Master" 
                    />
                  </div>
                  <div className="form-group">
                    <label>Global Reference Cell (Optional)</label>
                    <input 
                      type="text" 
                      className="input-control" 
                      value={globalRefCell}
                      onChange={(e) => setGlobalRefCell(e.target.value)}
                      placeholder="e.g. B2" 
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Excel Dynamic Scenarios */}
            <section>
              <h2 className="section-title"><List size={20} className="icon-logo" /> Data Consolidation Scenarios</h2>
              <div className="scenarios-list">
                {scenarios.map((scenario) => (
                  <div key={scenario.id} className="scenario-card glass-panel">
                    <div className="scenario-header">
                      <h3>
                        {getScenarioIcon(scenario.type)}
                        {getScenarioTitle(scenario.type)}
                      </h3>
                      <button className="btn btn-danger" onClick={() => removeScenario(scenario.id)} title="Remove Scenario">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    {renderScenarioSettings(scenario)}
                  </div>
                ))}
              </div>

              <div className="add-scenario-container">
                <div className="scenario-dropdown" ref={dropdownRef}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    style={{ padding: '0.75rem 2rem' }}
                  >
                    <Plus size={20} /> Add Consolidation Scenario
                  </button>
                  
                  {isDropdownOpen && (
                    <div className="dropdown-content glass-panel">
                      <button className="dropdown-item" onClick={() => addScenario("default")}>
                        <strong>Default Column Headers</strong>
                        <span className="desc">Standard table with a header row</span>
                      </button>
                      <button className="dropdown-item" onClick={() => addScenario("transpose")}>
                        <strong>Label/Value Pairs (Transpose)</strong>
                        <span className="desc">Flips rows and columns automatically</span>
                      </button>
                      <button className="dropdown-item" onClick={() => addScenario("custom_headers")}>
                        <strong>Custom Header Values</strong>
                        <span className="desc">For tables without headers</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* CSV General Configuration */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 className="section-title" style={{ margin: 0 }}>
                  <Settings size={20} className="icon-logo" /> CSV Settings
                </h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setShowHowTo(true)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <BookOpen size={22} />
                    How To
                  </button>
                  <button onClick={() => setShowAbout(true)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                    <HelpCircle size={22} />
                    About
                  </button>
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="config-grid">
                  <div className="form-group">
                    <label>Source Folder (Input CSV Files)</label>
                    <div className="folder-select-group">
                      <input type="text" className="input-control" value={csvSourceDir} readOnly placeholder="Select folder..." />
                      <button className="btn btn-secondary" onClick={() => selectFolder(true)}>
                        <FolderOpen size={18} /> Browse
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Destination Folder (Output Location)</label>
                    <div className="folder-select-group">
                      <input type="text" className="input-control" value={csvDestDir} readOnly placeholder="Select folder..." />
                      <button className="btn btn-secondary" onClick={() => selectFolder(false)}>
                        <FolderOpen size={18} /> Browse
                      </button>
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Output Filename (auto-appends datetime stamp)</label>
                    <input 
                      type="text" 
                      className="input-control" 
                      value={csvOutputName}
                      onChange={(e) => setCsvOutputName(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)' }}></div>

                <div className="config-grid">
                  <div className="form-group">
                    <label>Input Encoding (Source files)</label>
                    <select className="input-control" value={csvEncoding} onChange={(e) => setCsvEncoding(e.target.value)}>
                      <option value="utf-8">UTF-8</option>
                      <option value="windows-1252">Windows-1252 (ANSI)</option>
                      <option value="utf-16le">UTF-16 LE</option>
                      <option value="iso-8859-1">ISO-8859-1</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Output Format</label>
                    <select className="input-control" value={csvOutputFormat} onChange={(e) => setCsvOutputFormat(e.target.value)}>
                      <option value="xlsx">Excel Workbook (.xlsx)</option>
                      <option value="csv-utf8">CSV File (.csv, UTF-8)</option>
                      <option value="csv-match">CSV File (.csv, Match Source Encoding)</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* CSV Data Extraction Settings */}
            <section>
              <h2 className="section-title"><Download size={20} className="icon-logo" /> Data Extraction Settings</h2>
              
              <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  <strong>Auto-Detection Enabled:</strong> The engine will automatically find the header row, extract every single column, and read all valid data rows. If no headers are found, dummy column names will be generated. The <strong>File Name</strong> is automatically injected as the very first column.
                </p>
              </div>

              <div className="scenario-card glass-panel">
                <div className="scenario-grid">
                  <div className="form-group">
                    <label>Fill Empty Cells with Value</label>
                    <input 
                      type="text" 
                      className="input-control"
                      value={csvFillVal}
                      onChange={(e) => setCsvFillVal(e.target.value)}
                      placeholder="e.g. 0 or None" 
                    />
                  </div>
                  <div className="form-group">
                    <label>Exclude rows where Column...</label>
                    <input 
                      type="text" 
                      className="input-control"
                      value={csvExcludeCol}
                      onChange={(e) => setCsvExcludeCol(e.target.value)}
                      placeholder="e.g. Status" 
                    />
                  </div>
                  <div className="form-group">
                    <label>...Equals Value</label>
                    <input 
                      type="text" 
                      className="input-control"
                      value={csvExcludeVal}
                      onChange={(e) => setCsvExcludeVal(e.target.value)}
                      placeholder="e.g. Void" 
                    />
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Bottom Action Bar */}
      <footer className="action-bar glass-panel">
        <div className="progress-info">
          <div className="progress-text">
            <span>{status}</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
        
        <button 
          className="btn btn-primary" 
          style={{ padding: '1rem 2rem', fontSize: '1rem' }}
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <>Processing...</>
          ) : (
            <><Play size={20} /> Run Consolidation</>
          )}
        </button>
      </footer>
      </main>
    </div>
  );
}

export default App;
