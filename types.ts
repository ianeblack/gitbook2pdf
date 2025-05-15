// Types
export interface Config {
    url: string;
    outputDir: string;
    concurrency: number;
    retries: number;
    delay: number;
    hideElements: boolean;
    format: 'A4' | 'A3' | 'Letter';
    quality: 'low' | 'medium' | 'high';
    resume: boolean;
    includePatterns: string[];
    excludePatterns: string[];
    timeout: number;
}

export interface SitemapUrl {
    loc: string | string[];
    lastmod?: string;
    changefreq?: string;
    priority?: string;
}

export interface ParsedSitemap {
    urlset?: {
        url: SitemapUrl | SitemapUrl[];
    };
    sitemapindex?: {
        sitemap: { loc: string } | { loc: string }[];
    };
}

export interface ProcessingResult {
    url: string;
    success: boolean;
    error?: string;
    outputPath?: string;
    size?: number;
    duration?: number;
}

export interface ProcessingStats {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    totalSize: number;
    totalDuration: number;
}
