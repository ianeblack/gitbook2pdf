![gitbook2pdf gradient image](./img.png)
# 📚➡️📄 gb2pdf

> Convert GitBook documentation to PDF with a single command! 🚀

## ⚡ Quick Start

### Clone and install 📥
```bash
git clone https://github.com/yourusername/gb2pdf
cd gb2pdf
bun install
```

### Convert GitBook to PDF 🎯
```bash
bun pdf
```

## ✨ What it does

- 🔍 Finds all pages in your GitBook sitemap
- 📄 Converts each page to high-quality PDF
- 📁 Organizes files by category
- 🎨 Preserves formatting and images

## 🛠️ Requirements

- [Bun](https://bun.sh) v1.2.4+ ⚡

## 💡 How it works

1. 🌐 Enter your GitBook URL when prompted
2. 🗺️ Fetches the sitemap automatically
3. 📸 Captures each page as PDF
4. 💾 Saves organized files in `./pdfs/`

## 📂 Output Structure

```
pdfs/
├── 📁 category1/
│   ├── 001_page1.pdf
│   └── 002_page2.pdf
└── 📁 category2/
    └── 003_page3.pdf
```

## 🔧 Dependencies

- 🌐 **axios** - HTTP requests
- 🤖 **puppeteer** - PDF generation  
- 🔧 **xml2js** - Sitemap parsing

## 📝 License

MIT License © 2025 Ian Irizarry

---

<p align="center">
  <strong>Made with ❤️ and ⚡ Bun</strong>
</p>
