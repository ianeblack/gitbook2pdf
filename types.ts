// Interface for sitemap URL entry
export interface SitemapUrl {
    loc: string | string[];
    lastmod?: string;
    changefreq?: string;
    priority?: string;
}

// Interface for sitemap structure
interface SitemapUrlSet {
    urlset: {
        url: SitemapUrl | SitemapUrl[];
    };
}

// Interface for sitemap index
interface SitemapIndex {
    sitemapindex: {
        sitemap: SitemapIndexEntry | SitemapIndexEntry[];
    };
}

interface SitemapIndexEntry {
    loc: string;
    lastmod?: string;
}

// Union type for parsed sitemap
export type ParsedSitemap = SitemapUrlSet | SitemapIndex;

// Interface for page content check
export interface PageContentCheck {
    hasText: boolean;
    textLength: number;
    hasElements: boolean;
    url: string;
    title: string;
}

// Interface for PDF options
export interface PdfCaptureOptions {
    hideElements?: boolean;
    debug?: boolean;
}
