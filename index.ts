import puppeteer, { Page, Browser, type PDFOptions } from "puppeteer";
import axios, { type AxiosResponse } from "axios";
import xml2js from "xml2js";
import fs from "fs";
import path from "path";
import type { PageContentCheck, ParsedSitemap, PdfCaptureOptions, SitemapUrl } from "./types";

// Default URL (used as an example)
let URL_GITBOOK = "";

/**
 * Function to prompt the user for the Gitbook URL
 * @returns {Promise<string>} The URL entered by the user
 */
async function promptForGitbookUrl(): Promise<string> {
    console.log("Welcome to Gitbook to PDF/PNG Converter!");
    console.log("Please enter the root URL of your Gitbook (e.g., https://your-gitbook.io/)");

    // Use Bun's built-in prompt
    const url = await new Promise<string>(resolve => {
        process.stdout.write("> ");
        process.stdin.once("data", (data: Buffer) => {
            resolve(data.toString().trim());
        });
    });

    // Validate URL format
    try {
        new URL(url);
        return url;
    } catch (error) {
        console.error("Invalid URL format. Please try again with a valid URL.");
        return promptForGitbookUrl(); // Recursively ask again
    }
}

// Function to fetch and parse sitemap XML with better error handling
async function fetchSitemap(url: string): Promise<string[] | null> {
    try {
        console.log(`Fetching sitemap from: ${url}`);
        const response: AxiosResponse<string> = await axios.get(url);
        const sitemapXML = response.data;

        console.log(`Sitemap XML content preview:`, sitemapXML.substring(0, 500));

        // Parse the XML sitemap into JSON
        const parsedSitemap: ParsedSitemap = await xml2js.parseStringPromise(sitemapXML, {
            explicitArray: false,
            ignoreAttrs: false,
        });

        console.log(
            "Parsed sitemap structure:",
            JSON.stringify(parsedSitemap, null, 2),
        );

        // Check if this is a sitemap index file
        if ('sitemapindex' in parsedSitemap) {
            console.log("Detected sitemap index file");
            const sitemapIndexUrls = parsedSitemap.sitemapindex.sitemap;

            // Handle both single sitemap and array of sitemaps
            const sitemaps = Array.isArray(sitemapIndexUrls)
                ? sitemapIndexUrls
                : [sitemapIndexUrls];

            let allUrls: string[] = [];

            // Fetch each individual sitemap
            for (const sitemapInfo of sitemaps) {
                const sitemapUrl = sitemapInfo.loc;
                console.log(`Fetching individual sitemap: ${sitemapUrl}`);
                const individualUrls = await fetchSitemap(sitemapUrl);
                if (individualUrls) {
                    allUrls = allUrls.concat(individualUrls);
                }
            }

            return allUrls;
        }

        // Check if this is a regular sitemap with urlset
        if ('urlset' in parsedSitemap && parsedSitemap.urlset?.url) {
            const urls = parsedSitemap.urlset.url;

            // Handle both single URL and array of URLs
            const urlArray = Array.isArray(urls) ? urls : [urls];

            return urlArray
                .map((url: SitemapUrl): string | null => {
                    // Handle different structures for URL objects
                    if (typeof url === "string") {
                        return url;
                    } else if (url.loc) {
                        return typeof url.loc === "string" ? url.loc : url.loc[0];
                    }
                    return null;
                })
                .filter((url): url is string => Boolean(url));
        }

        // Check for other possible structures
        console.error(
            "Unknown sitemap structure. Available properties:",
            Object.keys(parsedSitemap),
        );
        return null;
    } catch (error: any) {
        console.error("Error fetching or parsing sitemap:", error);

        // If the sitemap doesn't exist, try some common alternatives
        if (error.response && error.response.status === 404) {
            console.log("Sitemap.xml not found, trying alternatives...");

            // Try alternative sitemap URLs
            const alternatives = [
                `${URL_GITBOOK}/sitemap_index.xml`,
                `${URL_GITBOOK}/sitemaps.xml`,
                `${URL_GITBOOK}/sitemap-index.xml`,
            ];

            for (const altUrl of alternatives) {
                try {
                    console.log(`Trying alternative: ${altUrl}`);
                    return await fetchSitemap(altUrl);
                } catch (altError) {
                    console.log(`Alternative ${altUrl} also failed`);
                }
            }
        }

        return null;
    }
}

// Function to convert a page to PDF with selectable text and high-quality images
async function takeFullPagePdf(
    page: Page,
    url: string,
    outputPath: string,
    options: PdfCaptureOptions = {}
): Promise<boolean> {
    try {
        console.log(`Processing: ${url}`);

        // Set the viewport to a reasonable width (e.g., 1280px) for full-page capture
        await page.setViewport({ width: 1280, height: 2048 });

        // Go to the page and wait for it to load completely
        await page.goto(url, {
            waitUntil: ["networkidle2", "domcontentloaded"],
            timeout: 45000,
        });

        // Wait for GitBook content to load - look for common GitBook elements
        try {
            await page.waitForSelector(
                'main, article, [data-testid="content"], .gitbook-content, .page-content',
                {
                    timeout: 10000,
                },
            );
            console.log(`Content detected on ${url}`);
        } catch (e) {
            console.log(
                `Warning: Content selector not found on ${url}, proceeding anyway`,
            );
        }

        // Additional wait for dynamic content
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));

        // Debug: Check if there's content on the page
        const hasContent: PageContentCheck = await page.evaluate((): PageContentCheck => {
            const body = document.body;
            const textContent = body.innerText || body.textContent || "";
            const hasVisibleElements =
                document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, div").length > 0;

            return {
                hasText: textContent.trim().length > 0,
                textLength: textContent.length,
                hasElements: hasVisibleElements,
                url: window.location.href,
                title: document.title,
            };
        });

        console.log(`Page content check for ${url}:`, hasContent);

        if (!hasContent.hasText && !hasContent.hasElements) {
            console.warn(
                `⚠️  No content detected on ${url} - might be a redirect or login required`,
            );
        }

        // Only hide elements if the option is enabled (default: false for debugging)
        if (options.hideElements !== false) {
            await page.evaluate(() => {
                // More conservative element hiding - only hide clear navigation elements
                const selectorsToHide = [
                    // Only hide obvious navigation and sidebar elements
                    "nav:not(main nav)",
                    "aside:not(main aside)",
                    ".sidebar:not(main .sidebar)",
                    ".navigation:not(main .navigation)",
                    ".navbar:not(main .navbar)",
                    ".menu:not(main .menu)",
                    ".header:not(main .header)",
                    ".footer:not(main .footer)",

                    // GitBook specific - but more conservative
                    'header[data-testid="header"]',
                    'aside[data-testid="sidebar"]',
                    'div[data-testid="search-button"]',
                    'div[data-testid="page-footer-navigation"]',
                ];

                // Hide elements more carefully
                selectorsToHide.forEach((selector) => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach((element) => {
                            // Don't hide elements that are clearly part of main content
                            if (!element.closest('main, article, .content, [role="main"]')) {
                                (element as HTMLElement).style.visibility = "hidden"; // Use visibility instead of display to maintain layout
                                (element as HTMLElement).style.height = "0px";
                                (element as HTMLElement).style.overflow = "hidden";
                            }
                        });
                    } catch (e) {
                        console.log(`Could not hide element with selector: ${selector}`, e);
                    }
                });
            });
        }

        // Convert the page to PDF with high-quality images
        const pdfOptions: PDFOptions = {
            path: outputPath,
            format: "A4",
            printBackground: true,
            scale: 0.8, // Slightly smaller scale to fit more content
            preferCSSPageSize: false, // Let PDF determine page size
            margin: {
                top: "0.5cm",
                right: "0.5cm",
                bottom: "0.5cm",
                left: "0.5cm",
            },
            displayHeaderFooter: false,
        };

        await page.pdf(pdfOptions);

        console.log(`✅ Saved PDF for: ${url} at ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to take PDF for: ${url}`, error);

        // Try to take a screenshot for debugging failed pages
        try {
            const screenshotPath = outputPath.replace(".pdf", "_error.png");
            await page.screenshot({
                path: screenshotPath,
                fullPage: true,
            });
            console.log(`📸 Error screenshot saved: ${screenshotPath}`);
        } catch (screenshotError) {
            console.log("Could not take error screenshot");
        }

        return false;
    }
}

// Function to group URLs based on their categories
function categorizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/").filter(Boolean);

        if (pathParts.length === 0) {
            return "home";
        }

        // For GitBook URLs, the category is usually the first part of the path
        return pathParts[0] || "unknown";
    } catch (error) {
        console.error(`Error parsing URL: ${url}`, error);
        return "unknown";
    }
}

// Function to create a sanitized filename from URL
function createFilename(url: string, counter: number): string {
    try {
        const urlObj = new URL(url);
        let filename = urlObj.pathname
            .split("/")
            .filter(Boolean)
            .join("_")
            .replace(/[^a-zA-Z0-9\-_]/g, "_")
            .substring(0, 100); // Limit filename length

        if (!filename || filename === "_") {
            filename = "index";
        }

        return `${counter.toString().padStart(3, "0")}_${filename}.pdf`;
    } catch (error) {
        return `${counter.toString().padStart(3, "0")}_page.pdf`;
    }
}

// Main function to run the script
async function run(): Promise<void> {
    // Prompt the user for the Gitbook URL
    URL_GITBOOK = await promptForGitbookUrl();
    console.log(`Using Gitbook URL: ${URL_GITBOOK}`);

    const sitemapUrl = `${URL_GITBOOK}/sitemap.xml`;
    const saveDir = "./pdfs";

    // Create the output directory if it doesn't exist
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    // Fetch the sitemap URLs
    console.log("Starting sitemap fetch...");
    const urls = await fetchSitemap(sitemapUrl);

    if (!urls || urls.length === 0) {
        console.error("No URLs found in sitemap or sitemap fetch failed");
        return;
    }

    console.log(`Found ${urls.length} URLs to process`);

    // Filter out any invalid URLs and deduplicate
    const validUrls = [
        ...new Set(
            urls.filter((url) => {
                try {
                    new URL(url);
                    return true;
                } catch {
                    console.warn(`Skipping invalid URL: ${url}`);
                    return false;
                }
            }),
        ),
    ];

    console.log(`Processing ${validUrls.length} valid URLs`);

    const browser: Browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page: Page = await browser.newPage();

    // Initialize the page counter
    let pageCounter = 1;
    let successCount = 0;
    let failureCount = 0;

    // Loop through each URL in the sitemap
    for (const url of validUrls) {
        try {
            // Determine the category based on the URL
            const category = categorizeUrl(url);
            const categoryDir = path.join(saveDir, category);

            // Create a folder for the category if it doesn't exist
            if (!fs.existsSync(categoryDir)) {
                fs.mkdirSync(categoryDir, { recursive: true });
            }

            // Generate a descriptive filename for the PDF
            const pdfFileName = createFilename(url, pageCounter);
            const pdfPath = path.join(categoryDir, pdfFileName);

            // Capture the full page as a PDF with options
            const success = await takeFullPagePdf(page, url, pdfPath, {
                hideElements: false, // Disable element hiding initially to debug
                debug: pageCounter <= 3, // Take debug screenshots for first 3 pages
            });

            if (success) {
                successCount++;
            } else {
                failureCount++;
            }

            // Increment the page counter
            pageCounter++;

            // Add a small delay between requests to be respectful
            await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        } catch (error) {
            console.error(`Error processing URL ${url}:`, error);
            failureCount++;
            pageCounter++;
        }
    }

    await browser.close();

    console.log("\n=== Summary ===");
    console.log(`Total URLs processed: ${validUrls.length}`);
    console.log(`Successful PDFs: ${successCount}`);
    console.log(`Failed PDFs: ${failureCount}`);
    console.log(`Output directory: ${path.resolve(saveDir)}`);
}

// Export the main function for testing
export { run, fetchSitemap, categorizeUrl, createFilename };

// Run the script if called directly
if (import.meta.main) {
    run().catch(console.error);
}
