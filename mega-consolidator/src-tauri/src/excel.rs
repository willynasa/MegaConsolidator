use calamine::{open_workbook_auto, Data, Reader};
use chrono::{DateTime, Local};
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
pub struct Scenario {
    pub id: String,
    #[serde(rename = "type")]
    pub scenario_type: String,
    #[serde(rename = "sheetName")]
    pub sheet_name: String,
    pub columns: String,
    #[serde(rename = "headerRow")]
    pub header_row: Option<usize>,
    #[serde(rename = "numRows")]
    pub num_rows: Option<usize>,
    #[serde(rename = "outputSheetName")]
    pub output_sheet_name: String,
    #[serde(rename = "customNames")]
    pub custom_names: Option<String>,
    #[serde(rename = "dropnaHow")]
    pub dropna_how: Option<String>,
    #[serde(rename = "fillnaVal")]
    pub fillna_val: Option<String>,
    #[serde(rename = "excludeCol")]
    pub exclude_col: Option<String>,
    #[serde(rename = "excludeVal")]
    pub exclude_val: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfigPayload {
    #[serde(rename = "sourceDir")]
    pub source_dir: String,
    #[serde(rename = "destDir")]
    pub dest_dir: String,
    #[serde(rename = "outputFileName")]
    pub output_file_name: String,
    #[serde(rename = "globalRefSheet")]
    pub global_ref_sheet: String,
    #[serde(rename = "globalRefCell")]
    pub global_ref_cell: String,
    pub scenarios: Vec<Scenario>,
}

fn col_to_index(col: &str) -> usize {
    let mut num = 0;
    for c in col.trim().to_uppercase().chars() {
        if c.is_ascii_uppercase() {
            num = num * 26 + (c as usize - 64);
        }
    }
    if num > 0 {
        num - 1
    } else {
        0
    }
}

fn cell_to_row_col(cell: &str) -> (usize, usize) {
    let mut col_str = String::new();
    let mut row_str = String::new();
    for c in cell.trim().chars() {
        if c.is_alphabetic() {
            col_str.push(c);
        } else if c.is_numeric() {
            row_str.push(c);
        }
    }
    let col = col_to_index(&col_str);
    let row = row_str.parse::<usize>().unwrap_or(1).saturating_sub(1);
    (row, col)
}

fn parse_columns_string(cols_str: &str) -> Vec<usize> {
    if cols_str.trim().is_empty() {
        return Vec::new();
    }
    let mut indices = Vec::new();
    for part in cols_str.split(',') {
        let part = part.trim();
        if part.contains(':') {
            let split: Vec<&str> = part.split(':').collect();
            if split.len() == 2 {
                let start = col_to_index(split[0]);
                let end = col_to_index(split[1]);
                for i in start..=end {
                    indices.push(i);
                }
            }
        } else if !part.is_empty() {
            indices.push(col_to_index(part));
        }
    }
    indices
}

fn is_empty_cell(cell: &Data) -> bool {
    match cell {
        Data::Empty => true,
        Data::String(s) if s.trim().is_empty() => true,
        _ => false,
    }
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Int(i) => i.to_string(),
        Data::Float(f) => f.to_string(),
        Data::String(s) => s.clone(),
        Data::Bool(b) => b.to_string(),
        Data::Error(e) => format!("{:?}", e),
        Data::Empty => String::new(),
        Data::DateTime(d) => d.to_string(), // Fallback
        Data::DateTimeIso(d) => d.clone(),
        Data::DurationIso(d) => d.clone(),
    }
}

#[tauri::command]
pub async fn run_consolidation(config: AppConfigPayload) -> Result<(), String> {
    println!("Starting consolidation...");

    let source_dir = PathBuf::from(&config.source_dir);
    if !source_dir.exists() || !source_dir.is_dir() {
        return Err("Source directory does not exist".into());
    }

    let dest_dir = PathBuf::from(&config.dest_dir);
    if !dest_dir.exists() || !dest_dir.is_dir() {
        return Err("Destination directory does not exist".into());
    }

    // Prepare master datasets for each scenario
    let mut master_datasets: std::collections::HashMap<String, Vec<Vec<String>>> =
        std::collections::HashMap::new();

    // Read directory
    let entries = fs::read_dir(&source_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            let ext = path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            if ext == "xls" || ext == "xlsx" || ext == "xlsm" || ext == "xlsb" {
                let file_name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();

                let mut workbook: calamine::Sheets<_> = match open_workbook_auto(&path) {
                    Ok(wb) => wb,
                    Err(e) => {
                        println!("Skipping file {} due to open error: {}", file_name, e);
                        continue;
                    }
                };

                // Extract global reference if needed
                let mut ref_val = String::new();
                if !config.global_ref_sheet.is_empty() && !config.global_ref_cell.is_empty() {
                    if let Ok(range) = workbook.worksheet_range(&config.global_ref_sheet) {
                        let (r, c) = cell_to_row_col(&config.global_ref_cell);
                        if let Some(cell) = range.get_value((r as u32, c as u32)) {
                            ref_val = cell_to_string(cell);
                        }
                    }
                }

                // Process each scenario
                for scenario in &config.scenarios {
                    if let Ok(range) = workbook.worksheet_range(&scenario.sheet_name) {
                        let target_cols = parse_columns_string(&scenario.columns);
                        if target_cols.is_empty() {
                            continue;
                        } // Must specify columns

                        let mut raw_data: Vec<Vec<String>> = Vec::new();

                        let mut start_row = 0;
                        if scenario.scenario_type == "default" {
                            start_row = scenario.header_row.unwrap_or(1).saturating_sub(1) as u32;
                        }

                        let max_rows = scenario.num_rows.unwrap_or(usize::MAX) as u32;
                        let mut rows_read = 0;

                        // Extract data
                        for (r_idx, row) in range.rows().enumerate() {
                            if (r_idx as u32) < start_row {
                                continue;
                            }

                            // Check max rows for default type data (excluding header)
                            if scenario.scenario_type == "default" && r_idx as u32 > start_row {
                                if rows_read >= max_rows {
                                    break;
                                }
                                rows_read += 1;
                            }

                            let mut row_data = Vec::new();
                            let mut is_completely_empty = true;

                            for &c_idx in &target_cols {
                                let cell = row.get(c_idx).unwrap_or(&Data::Empty);
                                if !is_empty_cell(cell) {
                                    is_completely_empty = false;
                                }
                                row_data.push(cell_to_string(cell));
                            }

                            // Stop reading if we hit a completely empty row in the target columns
                            if is_completely_empty {
                                break;
                            }

                            raw_data.push(row_data);
                        }

                        if raw_data.is_empty() {
                            continue;
                        }

                        let mut processed_data: Vec<Vec<String>> = Vec::new();
                        let has_ref = !ref_val.is_empty();

                        if scenario.scenario_type == "transpose" {
                            // Drop the original header row (e.g. "Label", "Value")
                            raw_data.remove(0);

                            // Exclude rows based on Label (column 0)
                            if let Some(exc_val) = &scenario.exclude_col {
                                if !exc_val.is_empty() {
                                    let vals: Vec<&str> = exc_val.split("||").map(|s| s.trim()).collect();
                                    raw_data.retain(|row| {
                                        row.first().map(|v| !vals.iter().any(|&val| v.trim().eq_ignore_ascii_case(val))).unwrap_or(true)
                                    });
                                }
                            }

                            if !raw_data.is_empty() && raw_data[0].len() >= 2 {
                                // Extract Labels (Col 0) and Values (Col 1)
                                let mut labels = Vec::new();
                                let mut values = Vec::new();

                                // Prepend static headers
                                labels.push("FileName".to_string());
                                if has_ref {
                                    labels.push("Reference Value".to_string());
                                }

                                values.push(file_name.clone());
                                if has_ref {
                                    values.push(ref_val.clone());
                                }

                                for row in &raw_data {
                                    labels.push(row[0].clone());
                                    values.push(row[1].clone());
                                }

                                // For transpose, processed_data will have 2 rows: Headers (Labels) and Data (Values)
                                processed_data.push(labels);
                                processed_data.push(values);
                            }
                        } else {
                            // Default or Custom Headers
                            let mut header_row = raw_data.remove(0);

                            if scenario.scenario_type == "custom_headers" {
                                if let Some(custom) = &scenario.custom_names {
                                    let splits: Vec<String> =
                                        custom.split(',').map(|s| s.trim().to_string()).collect();
                                    if !splits.is_empty() {
                                        header_row = splits;
                                    }
                                }
                            }

                            // Filter Data
                            for mut row in raw_data {
                                // Drop NA
                                if let Some(how) = &scenario.dropna_how {
                                    let empty_count =
                                        row.iter().filter(|c| c.trim().is_empty()).count();
                                    if how == "any" && empty_count > 0 {
                                        continue;
                                    }
                                    if how == "all" && empty_count == row.len() {
                                        continue;
                                    }
                                }

                                // Fill NA
                                if let Some(fill) = &scenario.fillna_val {
                                    if !fill.is_empty() {
                                        for cell in &mut row {
                                            if cell.trim().is_empty() {
                                                *cell = fill.clone();
                                            }
                                        }
                                    }
                                }

                                // Exclude Col/Val
                                if let (Some(c_name), Some(v_val)) =
                                    (&scenario.exclude_col, &scenario.exclude_val)
                                {
                                    if !c_name.is_empty() && !v_val.is_empty() {
                                        let mut idx_to_check = None;
                                        if scenario.scenario_type == "custom_headers" {
                                            // c_name is expected to be a column letter like "A"
                                            let abs_idx = col_to_index(c_name);
                                            if let Some(pos) =
                                                target_cols.iter().position(|&c| c == abs_idx)
                                            {
                                                idx_to_check = Some(pos);
                                            }
                                        } else {
                                            idx_to_check =
                                                header_row.iter().position(|h| h == c_name);
                                        }

                                        if let Some(idx) = idx_to_check {
                                            if let Some(cell_val) = row.get(idx) {
                                                let vals: Vec<&str> = v_val.split("||").map(|s| s.trim()).collect();
                                                if vals.iter().any(|&v| cell_val.trim().eq_ignore_ascii_case(v)) {
                                                    continue; // Skip this row
                                                }
                                            }
                                        }
                                    }
                                }

                                processed_data.push(row);
                            }

                            // Inject FileName and RefVal into header and data
                            if has_ref {
                                header_row.insert(0, "Reference Value".to_string());
                            }
                            header_row.insert(0, "FileName".to_string());

                            for row in processed_data.iter_mut() {
                                if has_ref {
                                    row.insert(0, ref_val.clone());
                                }
                                row.insert(0, file_name.clone());
                            }

                            // Prepend header back for this file batch
                            processed_data.insert(0, header_row);
                        }

                        // Append to Master
                        let master = master_datasets
                            .entry(scenario.id.clone())
                            .or_insert_with(Vec::new);

                        if master.is_empty() {
                            // If master is empty, push everything including headers
                            master.extend(processed_data);
                        } else {
                            // If master has data, skip header row
                            if !processed_data.is_empty() {
                                master.extend(processed_data.into_iter().skip(1));
                            }
                        }
                    }
                }
            }
        }
    }

    // Write Output
    let now: DateTime<Local> = Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let out_name = format!("{}_{}.xlsx", config.output_file_name, timestamp);
    let out_path = dest_dir.join(out_name);

    let mut out_wb = Workbook::new();

    for scenario in config.scenarios {
        if let Some(data) = master_datasets.get(&scenario.id) {
            if let Ok(sheet) = out_wb.add_worksheet().set_name(&scenario.output_sheet_name) {
                for (r, row) in data.iter().enumerate() {
                    for (c, cell) in row.iter().enumerate() {
                        let _ = sheet.write_string(r as u32, c as u16, cell);
                    }
                }
            }
        } else {
            // Empty sheet if no data
            let _ = out_wb.add_worksheet().set_name(&scenario.output_sheet_name);
        }
    }

    out_wb.save(out_path).map_err(|e| e.to_string())?;

    println!("Consolidation complete!");
    Ok(())
}
