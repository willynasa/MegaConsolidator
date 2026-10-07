use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use chrono::Local;
use rust_xlsxwriter::{Workbook, Format, Color};
use encoding_rs::*;
use csv::{ReaderBuilder, WriterBuilder};
use std::io::{Read, Write};
use serde_json::Value;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CsvConfig {
    pub source_dir: String,
    pub dest_dir: String,
    pub output_file_name: String,
    pub csv_encoding: Option<String>,
    pub csv_output_format: Option<String>,
    pub csv_fill_val: Option<String>,
    pub csv_exclude_col: Option<String>,
    pub csv_exclude_val: Option<String>,
}

pub fn run_csv_consolidation_logic(config: CsvConfig) -> Result<(), String> {
    let source_path = Path::new(&config.source_dir);
    if !source_path.exists() || !source_path.is_dir() {
        return Err("Source directory does not exist or is not a directory.".into());
    }

    let dest_path = Path::new(&config.dest_dir);
    if !dest_path.exists() {
        fs::create_dir_all(dest_path).map_err(|e| format!("Failed to create destination directory: {}", e))?;
    }

    let mut all_data: Vec<Vec<String>> = Vec::new();
    let mut header_row: Option<Vec<String>> = None;

    let encoding_name = config.csv_encoding.as_deref().unwrap_or("utf-8");
    let encoding = Encoding::for_label(encoding_name.as_bytes()).unwrap_or(UTF_8);

    let exclude_col = config.csv_exclude_col.as_deref().filter(|s| !s.trim().is_empty());
    let exclude_val = config.csv_exclude_val.as_deref().filter(|s| !s.trim().is_empty());
    let fill_val = config.csv_fill_val.as_deref().unwrap_or("").to_string();

    for entry in fs::read_dir(source_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("csv") {
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    
                    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
                    let mut buffer = Vec::new();
                    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                    
                    let (decoded_str, _, _) = encoding.decode(&buffer);
                    
                    let mut rdr = ReaderBuilder::new()
                        .has_headers(false) // We manually detect headers
                        .from_reader(decoded_str.as_bytes());

                    let mut is_first_row = true;
                    let mut current_file_headers = Vec::new();
                    let mut exclude_col_index: Option<usize> = None;

                    for result in rdr.records() {
                        let record = result.map_err(|e| e.to_string())?;
                        
                        // Check if row is entirely empty
                        let is_empty_row = record.iter().all(|c| c.trim().is_empty());
                        if is_empty_row {
                            continue; // Skip empty rows entirely
                        }

                        if is_first_row {
                            // Extract headers
                            for (i, field) in record.iter().enumerate() {
                                let mut field_str = field.trim().to_string();
                                if field_str.is_empty() {
                                    field_str = format!("Column{}", i + 1);
                                }
                                current_file_headers.push(field_str.clone());
                            }
                            
                            if header_row.is_none() {
                                let mut master_headers = vec!["File Name".to_string()];
                                master_headers.extend(current_file_headers.clone());
                                header_row = Some(master_headers);
                            }

                            if let (Some(col_name), Some(_)) = (exclude_col, exclude_val) {
                                exclude_col_index = current_file_headers.iter().position(|h| h.eq_ignore_ascii_case(col_name));
                            }

                            is_first_row = false;
                            continue;
                        }

                        // Check exclusion
                        if let (Some(idx), Some(val)) = (exclude_col_index, exclude_val) {
                            if let Some(cell_val) = record.get(idx) {
                                let vals: Vec<&str> = val.split("||").map(|s| s.trim()).collect();
                                if vals.iter().any(|&v| cell_val.trim().eq_ignore_ascii_case(v)) {
                                    continue; // Skip this row
                                }
                            }
                        }

                        let mut row_data = vec![file_name.clone()];
                        for i in 0..current_file_headers.len() {
                            let mut cell = record.get(i).unwrap_or("").trim().to_string();
                            if cell.is_empty() && !fill_val.is_empty() {
                                cell = fill_val.clone();
                            }
                            row_data.push(cell);
                        }
                        all_data.push(row_data);
                    }
                }
            }
        }
    }

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let output_format = config.csv_output_format.as_deref().unwrap_or("xlsx");

    if output_format == "xlsx" {
        let file_name = format!("{}_{}.xlsx", config.output_file_name, timestamp);
        let mut out_path = PathBuf::from(&config.dest_dir);
        out_path.push(&file_name);

        let mut out_wb = Workbook::new();
        let header_format = Format::new().set_bold().set_background_color(Color::RGB(0xCCCCCC));

        let sheet = out_wb.add_worksheet().set_name("Data").map_err(|e| e.to_string())?;

        // Write headers
        if let Some(headers) = &header_row {
            for (col_idx, header) in headers.iter().enumerate() {
                sheet.write_string_with_format(0, col_idx as u16, header, &header_format).map_err(|e| e.to_string())?;
            }
        }

        // Write data
        for (row_idx, row) in all_data.iter().enumerate() {
            for (col_idx, cell) in row.iter().enumerate() {
                sheet.write_string((row_idx + 1) as u32, col_idx as u16, cell).map_err(|e| e.to_string())?;
            }
        }

        out_wb.save(&out_path).map_err(|e| e.to_string())?;
    } else {
        // Output as CSV
        let ext = ".csv";
        let file_name = format!("{}_{}{}", config.output_file_name, timestamp, ext);
        let mut out_path = PathBuf::from(&config.dest_dir);
        out_path.push(&file_name);

        let out_encoding = if output_format == "csv-match" {
            encoding
        } else {
            UTF_8
        };

        let mut wtr = WriterBuilder::new().from_writer(vec![]);
        
        if let Some(headers) = &header_row {
            wtr.write_record(headers).map_err(|e| e.to_string())?;
        }

        for row in all_data {
            wtr.write_record(&row).map_err(|e| e.to_string())?;
        }

        let csv_bytes = wtr.into_inner().map_err(|e| e.to_string())?;
        let csv_string = String::from_utf8_lossy(&csv_bytes);
        
        let (encoded_bytes, _, _) = out_encoding.encode(&csv_string);
        
        let mut file = fs::File::create(&out_path).map_err(|e| e.to_string())?;
        file.write_all(&encoded_bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn run_csv_consolidation(config: Value) -> Result<(), String> {
    let parsed_config: CsvConfig = serde_json::from_value(config).map_err(|e| format!("Config parsing error: {}", e))?;
    run_csv_consolidation_logic(parsed_config)
}
