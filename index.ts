import puppeteer, { Page, Browser, type PDFOptions } from "puppeteer";
import axios, { type AxiosResponse, type AxiosRequestConfig } from "axios";
import xml2js from "xml2js";
import fs from "fs/promises";
import path from "path";
import pLimit from "p-limit";
import chalk from "chalk";
import ora from "ora";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { Config, PageContent, ParsedSitemap, ProcessingResult, ProcessingStats, SitemapUrl } from "./types";



class GitBookToPDFConverter {
    private config: Config;
    private browser: Browser | null = null;
    private stats: ProcessingStats = {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        totalSize: 0,
        totalDuration: 0
    };
    private progressFile: string;
    private processedUrls = new Set<string>();
    private pageContents: PageContent[] = []; // For merge functionality

    constructor(config: Config) {
        this.config = config;
        this.progressFile = path.join(config.outputDir, '.progress.json');
    }

    // Initialize browser with optimal settings
    private async initBrowser(): Promise<void> {
        if (this.browser) return;

        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--memory-pressure-off'
        ];

        this.browser = await puppeteer.launch({
            headless: true,
            args,
            defaultViewport: { width: 1280, height: 1024 }
        });
    }

    // Create a new page with optimal settings
    private async createPage(): Promise<Page> {
        if (!this.browser) await this.initBrowser();

        const page = await this.browser!.newPage();

        // Set up request interception for performance
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();

            // Block unnecessary resources to speed up loading
            if (['font', 'stylesheet', 'image'].includes(resourceType) && !this.isEssentialResource(request.url())) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Configure page for better performance
        await page.setCacheEnabled(false);
        await page.setJavaScriptEnabled(true);

        return page;
    }

    private isEssentialResource(url: string): boolean {
        // Allow essential stylesheets and images for GitBook content
        return url.includes('gitbook') || url.includes('fonts.googleapis.com');
    }

    // Enhanced sitemap fetching with retry logic
    private async fetchSitemap(url: string, retryCount = 0): Promise<string[]> {
        const spinner = ora(`Fetching sitemap from: ${url}`).start();

        try {
            const config: AxiosRequestConfig = {
                timeout: this.config.timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; GitBook-PDF-Converter/1.0)',
                },
            };

            const response: AxiosResponse<string> = await axios.get(url, config);

            const parsedSitemap: ParsedSitemap = await xml2js.parseStringPromise(response.data, {
                explicitArray: false,
                ignoreAttrs: false,
            });

            let urls: string[] = [];

            // Handle sitemap index
            if ('sitemapindex' in parsedSitemap) {
                const sitemaps = Array.isArray(parsedSitemap.sitemapindex!.sitemap)
                    ? parsedSitemap.sitemapindex!.sitemap
                    : [parsedSitemap.sitemapindex!.sitemap];

                for (const sitemap of sitemaps) {
                    const sitemapUrls = await this.fetchSitemap(sitemap.loc);
                    urls.push(...sitemapUrls);
                }
            }
            // Handle regular sitemap
            else if ('urlset' in parsedSitemap && parsedSitemap.urlset?.url) {
                const urlObjects = Array.isArray(parsedSitemap.urlset.url)
                    ? parsedSitemap.urlset.url
                    : [parsedSitemap.urlset.url];

                urls = urlObjects
                    .map((url: SitemapUrl) => {
                        if (typeof url === 'string') return url;
                        return Array.isArray(url.loc) ? url.loc[0] : url.loc;
                    })
                    .filter(Boolean);
            }

            spinner.succeed(`Found ${urls.length} URLs in sitemap`);
            return this.filterUrls(urls);

        } catch (error: any) {
            spinner.fail(`Failed to fetch sitemap: ${error.message}`);

            // Retry logic
            if (retryCount < this.config.retries) {
                console.log(`Retrying... (${retryCount + 1}/${this.config.retries})`);
                await this.delay(1000 * (retryCount + 1));
                return this.fetchSitemap(url, retryCount + 1);
            }

            // Try alternative URLs
            if (retryCount === 0) {
                const alternatives = [
                    url.replace('/sitemap.xml', '/sitemap_index.xml'),
                    url.replace('/sitemap.xml', '/sitemaps.xml'),
                    url.replace('/sitemap.xml', '/sitemap-index.xml'),
                ];

                for (const altUrl of alternatives) {
                    try {
                        return await this.fetchSitemap(altUrl, 0);
                    } catch (e) {
                        continue;
                    }
                }
            }

            throw new Error(`Could not fetch sitemap after ${this.config.retries} retries`);
        }
    }

    // Filter URLs based on include/exclude patterns
    private filterUrls(urls: string[]): string[] {
        return urls.filter(url => {
            // Check exclude patterns
            if (this.config.excludePatterns.some(pattern =>
                new RegExp(pattern).test(url))) {
                return false;
            }

            // Check include patterns (if any)
            if (this.config.includePatterns.length > 0) {
                return this.config.includePatterns.some(pattern =>
                    new RegExp(pattern).test(url));
            }

            return true;
        });
    }

    // Enhanced content extraction for merge functionality
    private async extractPageContent(url: string): Promise<PageContent | null> {
        let page: Page | null = null;

        try {
            page = await this.createPage();

            // Set viewport for consistent rendering
            await page.setViewport({ width: 1280, height: 1024 });

            // Navigate with enhanced wait conditions
            await page.goto(url, {
                waitUntil: ['networkidle2', 'domcontentloaded'],
                timeout: this.config.timeout,
            });

            // Wait for content to load
            await this.waitForContent(page, url);

            // Hide unwanted elements if configured
            if (this.config.hideElements) {
                await this.hideNavigationElements(page);
            }

            // Extract content and title
            const { html, title } = await page.evaluate(() => {
                // Get main content area
                const contentSelectors = [
                    'main',
                    'article',
                    '[data-testid="content"]',
                    '.gitbook-content',
                    '.page-content',
                    '.page-inner'
                ];

                let contentElement = null;
                for (const selector of contentSelectors) {
                    contentElement = document.querySelector(selector);
                    if (contentElement) break;
                }

                const html = contentElement ? contentElement.outerHTML : document.body.innerHTML;
                const title = document.title || document.querySelector('h1')?.textContent || 'Untitled';

                return { html, title };
            });

            return { url, html, title };

        } catch (error: any) {
            console.error(chalk.red(`Failed to extract content from ${url}: ${error.message}`));
            return null;
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    // Enhanced PDF generation with better error handling
    private async convertToPDF(url: string, outputPath: string): Promise<ProcessingResult> {
        const startTime = Date.now();
        let page: Page | null = null;

        try {
            // If merge is enabled, extract content instead of generating individual PDF
            if (this.config.merge) {
                const content = await this.extractPageContent(url);
                if (content) {
                    this.pageContents.push(content);
                    return {
                        url,
                        success: true,
                        outputPath: 'merged', // Placeholder
                        duration: Date.now() - startTime
                    };
                } else {
                    return {
                        url,
                        success: false,
                        error: 'Failed to extract content',
                        duration: Date.now() - startTime
                    };
                }
            }

            page = await this.createPage();

            // Set viewport for consistent rendering
            await page.setViewport({ width: 1280, height: 1024 });

            // Navigate with enhanced wait conditions
            await page.goto(url, {
                waitUntil: ['networkidle2', 'domcontentloaded'],
                timeout: this.config.timeout,
            });

            // Wait for content to load
            await this.waitForContent(page, url);

            // Hide unwanted elements if configured
            if (this.config.hideElements) {
                await this.hideNavigationElements(page);
            }

            // Generate PDF with quality settings
            const pdfOptions = this.getPDFOptions(outputPath);
            await page.pdf(pdfOptions);

            // Get file size for stats
            const stats = await fs.stat(outputPath);
            const duration = Date.now() - startTime;

            return {
                url,
                success: true,
                outputPath,
                size: stats.size,
                duration
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;

            // Take a debug screenshot on error
            if (page) {
                try {
                    const screenshotPath = outputPath.replace('.pdf', '_error.png');
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                } catch (e) {
                    // Ignore screenshot errors
                }
            }

            return {
                url,
                success: false,
                error: error.message,
                duration
            };
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    // Generate merged PDF from collected content
    private async generateMergedPDF(): Promise<void> {
        if (this.pageContents.length === 0) {
            console.warn(chalk.yellow('No content to merge'));
            return;
        }

        const spinner = ora('Generating merged PDF...').start();
        let page: Page | null = null;

        try {
            page = await this.createPage();

            // Create merged HTML content
            const mergedHTML = this.createMergedHTML(this.pageContents);

            // Set content
            await page.setContent(mergedHTML, { waitUntil: 'networkidle2' });

            // Apply CSS for print
            await page.addStyleTag({
                content: `
                    @page { 
                        margin: 0.5cm; 
                    }
                    .page-break { 
                        page-break-before: always; 
                    }
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                    }
                    h1, h2, h3, h4, h5, h6 {
                        color: #333;
                        margin-top: 1.5em;
                        margin-bottom: 0.5em;
                    }
                    .page-title {
                        font-size: 24px;
                        font-weight: bold;
                        color: #2c3e50;
                        margin-bottom: 1em;
                        border-bottom: 2px solid #3498db;
                        padding-bottom: 0.5em;
                    }
                    .page-url {
                        font-size: 12px;
                        color: #7f8c8d;
                        margin-bottom: 1em;
                    }
                `
            });

            // Generate PDF
            const outputPath = path.join(this.config.outputDir, 'merged-gitbook.pdf');
            const pdfOptions = this.getPDFOptions(outputPath);

            await page.pdf({
                ...pdfOptions,
                displayHeaderFooter: true,
                headerTemplate: '<div style="font-size:10px; margin: auto;">GitBook Documentation</div>',
                footerTemplate: '<div style="font-size:10px; margin: auto;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            });

            // Get file size for stats
            const stats = await fs.stat(outputPath);
            this.stats.totalSize = stats.size;

            spinner.succeed(`Merged PDF created: ${outputPath}`);
            console.log(chalk.green(`📁 Merged PDF Size: ${this.formatBytes(stats.size)}`));

        } catch (error: any) {
            spinner.fail(`Failed to generate merged PDF: ${error.message}`);
            throw error;
        } finally {
            if (page) {
                await page.close();
            }
        }
    }

    // Create merged HTML content
    private createMergedHTML(contents: PageContent[]): string {
        const pages = contents.map((content, index) => `
            <div class="${index > 0 ? 'page-break' : ''}">
                <div class="page-title">${content.title}</div>
                <div class="page-url">${content.url}</div>
                <div class="page-content">
                    ${content.html}
                </div>
            </div>
        `).join('\n');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>GitBook Documentation</title>
            </head>
            <body>
                ${pages}
            </body>
            </html>
        `;
    }

    private async waitForContent(page: Page, url: string): Promise<void> {
        try {
            // Wait for common GitBook content selectors
            await page.waitForSelector(
                'main, article, [data-testid="content"], .gitbook-content, .page-content, .page-inner',
                { timeout: 10000 }
            );

            // Additional wait for dynamic content
            await this.delay(2000);

            // Check if page has meaningful content
            const hasContent = await page.evaluate(() => {
                const body = document.body;
                const textContent = body.innerText || body.textContent || '';
                return textContent.trim().length > 100; // Minimum content threshold
            });

            if (!hasContent) {
                console.warn(chalk.yellow(`Warning: Minimal content detected on ${url}`));
            }

        } catch (e) {
            console.warn(chalk.yellow(`Warning: Content selectors not found on ${url}, proceeding anyway`));
            await this.delay(3000); // Fallback wait
        }
    }

    private async hideNavigationElements(page: Page): Promise<void> {
        await page.evaluate(() => {
            const selectorsToHide = [
                'nav:not(main nav)',
                'aside:not(main aside)',
                '.sidebar',
                '.navigation',
                '.navbar',
                '.menu',
                'header:not(main header)',
                'footer:not(main footer)',
                '[data-testid="sidebar"]',
                '[data-testid="header"]',
                '[data-testid="search-button"]',
                '[data-testid="page-footer-navigation"]',
                '.gitbook-sidebar',
                '.gitbook-header'
            ];

            selectorsToHide.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (!element.closest('main, article, .content, [role="main"]')) {
                            (element as HTMLElement).style.display = 'none';
                        }
                    });
                } catch (e) {
                    // Ignore individual selector errors
                }
            });
        });
    }

    private getPDFOptions(outputPath: string): PDFOptions {
        const qualitySettings = {
            low: { scale: 0.6, format: 'A4' as const },
            medium: { scale: 0.8, format: 'A4' as const },
            high: { scale: 1.0, format: 'A4' as const }
        };

        const { scale } = qualitySettings[this.config.quality];

        return {
            path: outputPath,
            format: this.config.format,
            printBackground: true,
            scale,
            preferCSSPageSize: false,
            margin: {
                top: '0.5cm',
                right: '0.5cm',
                bottom: '0.5cm',
                left: '0.5cm',
            },
            displayHeaderFooter: false,
        };
    }

    // Create organized file structure
    private createFileName(url: string, counter: number): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);

            let filename = pathParts
                .join('_')
                .replace(/[^a-zA-Z0-9\-_]/g, '_')
                .substring(0, 100);

            if (!filename || filename === '_') {
                filename = 'index';
            }

            return `${counter.toString().padStart(3, '0')}_${filename}.pdf`;
        } catch (error) {
            return `${counter.toString().padStart(3, '0')}_page.pdf`;
        }
    }

    private getCategory(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            return pathParts[0] || 'home';
        } catch (error) {
            return 'unknown';
        }
    }

    // Progress tracking and resume capability
    private async loadProgress(): Promise<void> {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf-8');
            const progress = JSON.parse(progressData);
            this.processedUrls = new Set(progress.processedUrls || []);
            this.stats = { ...this.stats, ...progress.stats };
        } catch (error) {
            // No existing progress file
        }
    }

    private async saveProgress(): Promise<void> {
        const progress = {
            processedUrls: Array.from(this.processedUrls),
            stats: this.stats,
            timestamp: new Date().toISOString()
        };

        await fs.writeFile(this.progressFile, JSON.stringify(progress, null, 2));
    }

    // Main processing function with parallel execution
    async process(): Promise<void> {
        console.log(chalk.blue('🚀 GitBook to PDF Converter Started'));
        console.log(chalk.gray(`Configuration: ${JSON.stringify({ ...this.config, url: '...' }, null, 2)}`));

        try {
            // Create output directory
            await fs.mkdir(this.config.outputDir, { recursive: true });

            // Load previous progress if resuming
            if (this.config.resume) {
                await this.loadProgress();
                console.log(chalk.yellow(`Resuming from previous run. ${this.processedUrls.size} URLs already processed.`));
            }

            // Fetch sitemap
            const sitemapUrl = `${this.config.url}/sitemap.xml`;
            const allUrls = await this.fetchSitemap(sitemapUrl);

            // Filter out already processed URLs if resuming
            const urlsToProcess = this.config.resume
                ? allUrls.filter(url => !this.processedUrls.has(url))
                : allUrls;

            console.log(chalk.green(`Found ${allUrls.length} total URLs, processing ${urlsToProcess.length} URLs`));

            if (this.config.merge) {
                console.log(chalk.blue('📄 Merge mode enabled - will create single merged PDF'));
            }

            // Set up concurrency limiter
            const limit = pLimit(this.config.concurrency);
            this.stats.total = urlsToProcess.length;

            // Create progress bar
            const progressBar = ora(`Processing 0/${urlsToProcess.length} URLs`).start();

            // Process URLs in parallel with controlled concurrency
            const promises = urlsToProcess.map((url, index) =>
                limit(async () => {
                    let outputPath = '';

                    // Create file path only if not merging
                    if (!this.config.merge) {
                        const category = this.getCategory(url);
                        const categoryDir = path.join(this.config.outputDir, category);
                        await fs.mkdir(categoryDir, { recursive: true });

                        const fileName = this.createFileName(url, index + this.processedUrls.size + 1);
                        outputPath = path.join(categoryDir, fileName);
                    }

                    // Convert to PDF (or extract content for merge)
                    const result = await this.convertToPDF(url, outputPath);

                    // Update stats
                    if (result.success) {
                        this.stats.successful++;
                        this.stats.totalSize += result.size || 0;
                        this.stats.totalDuration += result.duration || 0;
                        this.processedUrls.add(url);
                    } else {
                        this.stats.failed++;
                        console.error(chalk.red(`Failed: ${url} - ${result.error}`));
                    }

                    // Update progress
                    const processed = this.stats.successful + this.stats.failed;
                    progressBar.text = `Processing ${processed}/${urlsToProcess.length} URLs (Success: ${this.stats.successful}, Failed: ${this.stats.failed})`;

                    // Save progress periodically
                    if (processed % 10 === 0) {
                        await this.saveProgress();
                    }

                    // Rate limiting
                    if (this.config.delay > 0) {
                        await this.delay(this.config.delay);
                    }

                    return result;
                })
            );

            // Wait for all conversions to complete
            await Promise.all(promises);
            progressBar.succeed(`Completed processing ${urlsToProcess.length} URLs`);

            // Generate merged PDF if enabled
            if (this.config.merge) {
                await this.generateMergedPDF();
            }

            // Final progress save
            await this.saveProgress();

            // Print summary
            this.printSummary();

        } catch (error: any) {
            console.error(chalk.red(`Fatal error: ${error.message}`));
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    private printSummary(): void {
        console.log(chalk.blue('\n📊 Processing Summary'));
        console.log(chalk.green(`✅ Successful: ${this.stats.successful}`));
        console.log(chalk.red(`❌ Failed: ${this.stats.failed}`));
        console.log(chalk.cyan(`📁 Total Size: ${this.formatBytes(this.stats.totalSize)}`));
        console.log(chalk.cyan(`⏱️  Total Duration: ${this.formatDuration(this.stats.totalDuration)}`));
        console.log(chalk.gray(`📂 Output Directory: ${path.resolve(this.config.outputDir)}`));

        if (this.config.merge) {
            console.log(chalk.blue(`📄 Merged PDF: ${path.join(this.config.outputDir, 'merged-gitbook.pdf')}`));
        }

        if (this.stats.successful > 0) {
            const avgSize = this.stats.totalSize / this.stats.successful;
            const avgDuration = this.stats.totalDuration / this.stats.successful;
            console.log(chalk.cyan(`📊 Average Size: ${this.formatBytes(avgSize)}`));
            console.log(chalk.cyan(`📊 Average Duration: ${this.formatDuration(avgDuration)}`));
        }
    }

    private formatBytes(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    private formatDuration(ms: number): string {
        const seconds = ms / 1000;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

// CLI setup with yargs
async function setupCLI(): Promise<Config> {
    const argv = await yargs(hideBin(process.argv))
        .option('url', {
            alias: 'u',
            type: 'string',
            description: 'GitBook URL',
        })
        .option('output', {
            alias: 'o',
            type: 'string',
            default: './pdfs',
            description: 'Output directory',
        })
        .option('concurrency', {
            alias: 'c',
            type: 'number',
            default: 3,
            description: 'Number of concurrent PDF generations',
        })
        .option('retries', {
            alias: 'r',
            type: 'number',
            default: 3,
            description: 'Number of retries for failed requests',
        })
        .option('delay', {
            alias: 'd',
            type: 'number',
            default: 1000,
            description: 'Delay between requests (ms)',
        })
        .option('hide-elements', {
            type: 'boolean',
            default: true,
            description: 'Hide navigation elements',
        })
        .option('format', {
            type: 'string',
            default: 'A4',
            choices: ['A4', 'A3', 'Letter'],
            description: 'PDF format',
        })
        .option('quality', {
            type: 'string',
            default: 'medium',
            choices: ['low', 'medium', 'high'],
            description: 'PDF quality',
        })
        .option('resume', {
            type: 'boolean',
            default: false,
            description: 'Resume from previous run',
        })
        .option('include', {
            type: 'array',
            default: [],
            description: 'Include URL patterns (regex)',
        })
        .option('exclude', {
            type: 'array',
            default: [],
            description: 'Exclude URL patterns (regex)',
        })
        .option('timeout', {
            type: 'number',
            default: 30000,
            description: 'Request timeout (ms)',
        })
        .option('merge', {
            type: 'boolean',
            default: false,
            description: 'Merge all pages into a single PDF',
        })
        .help()
        .argv;

    // Prompt for URL if not provided
    let url = argv.url;
    if (!url) {
        console.log(chalk.blue('Welcome to GitBook to PDF Converter!'));
        console.log('Please enter the root URL of your Gitbook (e.g., https://your-gitbook.io/)');

        url = await new Promise<string>(resolve => {
            process.stdout.write('> ');
            process.stdin.once('data', (data: Buffer) => {
                resolve(data.toString().trim());
            });
        });
    }

    // Validate URL
    try {
        new URL(url);
    } catch (error) {
        console.error(chalk.red('Invalid URL format. Please provide a valid URL.'));
        process.exit(1);
    }

    return {
        url,
        outputDir: argv.output,
        concurrency: argv.concurrency,
        retries: argv.retries,
        delay: argv.delay,
        hideElements: argv.hideElements,
        format: argv.format as 'A4' | 'A3' | 'Letter',
        quality: argv.quality as 'low' | 'medium' | 'high',
        resume: argv.resume,
        includePatterns: argv.include as string[],
        excludePatterns: argv.exclude as string[],
        timeout: argv.timeout,
        merge: argv.merge,
    };
}

// Main execution
async function main(): Promise<void> {
    try {
        const config = await setupCLI();
        const converter = new GitBookToPDFConverter(config);
        await converter.process();
    } catch (error: any) {
        console.error(chalk.red(`Application error: ${error.message}`));
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.main) {
    main().catch(console.error);
}

export { GitBookToPDFConverter, main };
