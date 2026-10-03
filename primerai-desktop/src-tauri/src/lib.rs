use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};

fn path_in_roots(path: &Path, roots: &[String]) -> Result<PathBuf, String> {
    let candidate = path
        .canonicalize()
        .or_else(|_| {
            let parent = path.parent().ok_or(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "pasta inválida",
            ))?;
            let canonical_parent = parent.canonicalize()?;
            Ok::<PathBuf, std::io::Error>(
                canonical_parent.join(path.file_name().unwrap_or_default()),
            )
        })
        .map_err(|e| format!("caminho inválido: {e}"))?;
    for root in roots {
        let root = Path::new(root)
            .canonicalize()
            .map_err(|e| format!("workspace indisponível: {e}"))?;
        if candidate.starts_with(root) {
            return Ok(candidate);
        }
    }
    Err("o caminho está fora das pastas autorizadas".into())
}

#[tauri::command]
fn extract_pdf_text(path: String, roots: Vec<String>) -> Result<String, String> {
    let source = path_in_roots(Path::new(&path), &roots)?;
    if source
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase()
        != "pdf"
    {
        return Err("o arquivo não é PDF".into());
    }
    let output = Command::new("pdftotext")
        .arg("-layout")
        .arg(&source)
        .arg("-")
        .output()
        .map_err(|e| format!("não foi possível executar pdftotext (instale Poppler): {e}"))?;
    if !output.status.success() {
        return Err("falha ao extrair texto do PDF".into());
    }
    let text = String::from_utf8_lossy(&output.stdout)
        .chars()
        .take(120_000)
        .collect::<String>();
    if text.trim().is_empty() {
        return Err("PDF sem texto extraível (pode ser digitalizado)".into());
    }
    Ok(text)
}

#[tauri::command]
fn list_pdf_files(directory: String, roots: Vec<String>) -> Result<Vec<String>, String> {
    let dir = path_in_roots(Path::new(&directory), &roots)?;
    let mut files = fs::read_dir(dir)
        .map_err(|e| format!("não foi possível listar a pasta: {e}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|x| x.to_str())
                    .unwrap_or("")
                    .eq_ignore_ascii_case("pdf")
        })
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    files.sort();
    Ok(files)
}

fn pdf_escape(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '(' => "\\(".into(),
            ')' => "\\)".into(),
            '\\' => "\\\\".into(),
            '\n' | '\r' => " ".into(),
            'á' | 'à' | 'ã' | 'â' | 'ä' | 'Á' | 'À' | 'Ã' | 'Â' | 'Ä' => "a".into(),
            'é' | 'ê' | 'ë' | 'É' | 'Ê' | 'Ë' => "e".into(),
            'í' | 'ï' | 'Í' | 'Ï' => "i".into(),
            'ó' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ô' | 'Õ' | 'Ö' => "o".into(),
            'ú' | 'ü' | 'Ú' | 'Ü' => "u".into(),
            'ç' | 'Ç' => "c".into(),
            'ñ' | 'Ñ' => "n".into(),
            c if c.is_ascii() => c.to_string(),
            _ => "?".into(),
        })
        .collect()
}

fn make_pdf(title: &str, text: &str) -> Vec<u8> {
    let mut lines = vec![title.to_string(), String::new()];
    for paragraph in text.lines() {
        let mut rest = paragraph.trim();
        while rest.len() > 92 {
            let safe_end = rest
                .char_indices()
                .take(92)
                .last()
                .map(|(i, c)| i + c.len_utf8())
                .unwrap_or(rest.len());
            let split = rest
                .char_indices()
                .take_while(|(i, _)| *i < safe_end)
                .filter(|(_, c)| c.is_whitespace())
                .map(|(i, _)| i)
                .last()
                .unwrap_or(safe_end);
            lines.push(rest[..split].to_string());
            rest = rest[split..].trim();
        }
        lines.push(rest.to_string());
    }
    let pages = lines.chunks(48).collect::<Vec<_>>();
    let mut objects = vec![String::new(); 3 + pages.len() * 2];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>".into();
    let kids = (0..pages.len())
        .map(|i| format!("{} 0 R", 3 + i * 2))
        .collect::<Vec<_>>()
        .join(" ");
    objects[2] = format!("<< /Type /Pages /Kids [{kids}] /Count {} >>", pages.len());
    let font_id = objects.len();
    for (i, page) in pages.iter().enumerate() {
        let page_id = 3 + i * 2;
        let content_id = page_id + 1;
        let mut stream = String::from("BT /F1 10 Tf 48 790 Td 14 TL\n");
        for line in *page {
            stream.push_str(&format!("({}) Tj T*\n", pdf_escape(line)));
        }
        stream.push_str("ET");
        objects[page_id] = format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>");
        objects[content_id] = format!(
            "<< /Length {} >>\nstream\n{}\nendstream",
            stream.len(),
            stream
        );
    }
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".into());
    let mut out = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![0usize];
    for (i, obj) in objects.iter().enumerate().skip(1) {
        offsets.push(out.len());
        out.extend_from_slice(format!("{i} 0 obj\n{obj}\nendobj\n").as_bytes());
    }
    let xref = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len()).as_bytes());
    for offset in offsets.iter().skip(1) {
        out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF",
            objects.len()
        )
        .as_bytes(),
    );
    out
}

#[tauri::command]
fn write_report_pdf(
    path: String,
    title: String,
    text: String,
    roots: Vec<String>,
) -> Result<String, String> {
    let target = path_in_roots(Path::new(&path), &roots)?;
    if target
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase()
        != "pdf"
    {
        return Err("destino deve ser um PDF".into());
    }
    let parent = target.parent().ok_or("pasta destino inválida")?;
    let stem = target
        .file_stem()
        .and_then(|x| x.to_str())
        .unwrap_or("Relatorio");
    for suffix in 1..=100 {
        let name = if suffix == 1 {
            format!("{stem}.pdf")
        } else {
            format!("{stem} ({suffix}).pdf")
        };
        let candidate = parent.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                file.write_all(&make_pdf(&title, &text))
                    .map_err(|e| format!("não foi possível concluir o relatório: {e}"))?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("não foi possível salvar o relatório: {e}")),
        }
    }
    Err("não foi possível escolher um nome livre para o relatório".into())
}

#[tauri::command]
fn write_text_file(path: String, text: String, roots: Vec<String>) -> Result<String, String> {
    let target = path_in_roots(Path::new(&path), &roots)?;
    if target.extension().and_then(|x| x.to_str()).unwrap_or("").eq_ignore_ascii_case("txt") == false {
        return Err("destino deve ser um arquivo .txt".into());
    }
    let parent = target.parent().ok_or("pasta destino inválida")?;
    let stem = target.file_stem().and_then(|x| x.to_str()).unwrap_or("Pesquisa");
    for suffix in 1..=100 {
        let name = if suffix == 1 { format!("{stem}.txt") } else { format!("{stem} ({suffix}).txt") };
        let candidate = parent.join(name);
        match fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut file) => {
                file.write_all(text.as_bytes()).map_err(|e| format!("não foi possível salvar o arquivo: {e}"))?;
                return Ok(candidate.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("não foi possível salvar o arquivo: {e}")),
        }
    }
    Err("não foi possível escolher um nome livre para o arquivo".into())
}

#[tauri::command]
fn create_directory(path: String, roots: Vec<String>) -> Result<(), String> {
    let target = Path::new(&path);
    let parent = target.parent().ok_or("pasta destino inválida")?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("pasta pai inválida: {e}"))?;
    let permitted = roots.iter().any(|r| {
        Path::new(r)
            .canonicalize()
            .map(|root| canonical_parent.starts_with(root))
            .unwrap_or(false)
    });
    if !permitted || target.file_name().is_none() {
        return Err("o destino está fora das pastas autorizadas".into());
    }
    fs::create_dir_all(target).map_err(|e| format!("não foi possível criar a pasta: {e}"))
}

#[tauri::command]
fn copy_pdf(source: String, directory: String, roots: Vec<String>) -> Result<String, String> {
    let source = path_in_roots(Path::new(&source), &roots)?;
    let directory = path_in_roots(Path::new(&directory), &roots)?;
    if !directory.is_dir()
        || source
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase()
            != "pdf"
    {
        return Err("origem ou destino PDF inválido".into());
    }
    let stem = source
        .file_stem()
        .and_then(|x| x.to_str())
        .unwrap_or("documento");
    let mut extension = source
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("pdf")
        .to_string();
    extension.make_ascii_lowercase();
    for suffix in 1..=100 {
        let name = if suffix == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({suffix}).{extension}")
        };
        let target = directory.join(name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut output) => {
                let mut input = fs::File::open(&source)
                    .map_err(|e| format!("não foi possível ler o PDF: {e}"))?;
                std::io::copy(&mut input, &mut output)
                    .map_err(|e| format!("falha ao copiar o PDF: {e}"))?;
                return Ok(target.to_string_lossy().into_owned());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("não foi possível copiar o PDF: {e}")),
        }
    }
    Err("não foi possível escolher um nome livre para a cópia do PDF".into())
}

#[derive(serde::Serialize)]
struct SuggestedWorkspace {
    label: String,
    path: String,
}

#[tauri::command]
fn suggested_workspaces() -> Vec<SuggestedWorkspace> {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    let Some(home) = home.map(PathBuf::from) else {
        return Vec::new();
    };
    let downloads = home.join("Downloads");
    let desktop = [home.join("Desktop"), home.join("Área de trabalho")]
        .into_iter()
        .find(|p| p.is_dir());
    let mut found = Vec::new();
    if downloads.is_dir() {
        found.push(SuggestedWorkspace {
            label: "Downloads".into(),
            path: downloads.to_string_lossy().into_owned(),
        });
    }
    if let Some(path) = desktop {
        found.push(SuggestedWorkspace {
            label: "Área de trabalho".into(),
            path: path.to_string_lossy().into_owned(),
        });
    }
    found
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            extract_pdf_text,
            list_pdf_files,
            write_report_pdf,
            write_text_file,
            create_directory,
            copy_pdf,
            suggested_workspaces
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
