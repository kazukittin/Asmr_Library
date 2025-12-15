use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapedMetadata {
    pub title: String,
    pub circle: Option<String>,
    pub voice_actors: Vec<String>,
    pub tags: Vec<String>,
}

pub async fn fetch_dlsite_metadata(rj_code: &str) -> Result<ScrapedMetadata, String> {
    // Determine URL based on RJ code prefix (assuming generic for now, but usually RJ is mania or books)
    // Most ASMR is on 'maniax' (R18) or 'home' (All ages).
    // Safest bet is to try the product page directly.
    let url = format!("https://www.dlsite.com/maniax/work/=/product_id/{}.html", rj_code);

    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        // Cookies might be needed for age verification bypass if Dlsite enforces it strictly on scraping
        .header("Cookie", "adult_checked=1") 
        .send()
        .await
        .map_err(|e| format!("Failed to fetch DLsite page: {}", e))?;

    if !resp.status().is_success() {
        // Try 'home' if 'maniax' fails (for all ages works)
        let url_home = format!("https://www.dlsite.com/home/work/=/product_id/{}.html", rj_code);
        let resp_home = client.get(&url_home)
             .header("User-Agent", "Mozilla/5.0")
             .send()
             .await
             .map_err(|e| format!("Failed to fetch DLsite page (home): {}", e))?;
             
        if !resp_home.status().is_success() {
             return Err(format!("DLsite page not found for {}", rj_code));
        }
        
        let body = resp_home.text().await.map_err(|e| e.to_string())?;
        return parse_dlsite_html(&body);
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    parse_dlsite_html(&body)
}

fn parse_dlsite_html(html_content: &str) -> Result<ScrapedMetadata, String> {
    let document = Html::parse_document(html_content);

    // Selectors
    let title_selector = Selector::parse("#work_name").unwrap();
    let circle_selector = Selector::parse("#work_maker .maker_name").unwrap();
    // Layout typically has a table with "Voice Actor" row
    // Simplified selector strategy: Look for table rows th:contains("声優") + td
    
    // Using a more robust approach for Outline table
    let outline_row_selector = Selector::parse("table#work_outline tr").unwrap();
    let th_selector = Selector::parse("th").unwrap();
    let td_selector = Selector::parse("td").unwrap();
    let a_selector = Selector::parse("a").unwrap();
    
    // Extract Title
    let title = document.select(&title_selector)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_string())
        .ok_or("Could not find title")?;

    // Extract Circle
    let circle = document.select(&circle_selector)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_string());

    let mut voice_actors = Vec::new();
    let mut tags = Vec::new();

    for row in document.select(&outline_row_selector) {
        let th_text = row.select(&th_selector).next()
            .map(|th| th.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if th_text.contains("声優") {
            if let Some(td) = row.select(&td_selector).next() {
                // Voice actors are often links
                for a in td.select(&a_selector) {
                    voice_actors.push(a.text().collect::<String>().trim().to_string());
                }
                // Sometimes plain text if not linked? Usually they are linked.
            }
        } else if th_text.contains("ジャンル") { // Tags/Genre
             if let Some(td) = row.select(&td_selector).next() {
                for a in td.select(&a_selector) {
                    tags.push(a.text().collect::<String>().trim().to_string());
                }
            }
        }
    }
    
    // Main Genre tags might be separate from outline table in some layouts, 
    // but usually "Genre" in outline covers it. 
    // Sometimes there is a separate tag list at bottom.
    // Let's also check `.main_genre a` if tags is empty?
    if tags.is_empty() {
        let genre_selector = Selector::parse(".main_genre a").unwrap();
        for a in document.select(&genre_selector) {
             tags.push(a.text().collect::<String>().trim().to_string());
        }
    }

    Ok(ScrapedMetadata {
        title,
        circle,
        voice_actors,
        tags,
    })
}
