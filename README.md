![gitbook2pdf gradient image](./img.png)

[![Made with Bun](https://img.shields.io/badge/Made%20with-Bun-orange?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](https://opensource.org/licenses/MIT)


# 📚➡️📄 gb2pdf

> High-performance GitBook to PDF converter with parallel processing, resume capability, merge option, and smart filtering! ⚡
## ⚡ Quick Start

### Install 📥
```bash
git clone https://github.com/tsoodo/gitbook2pdf ./gb2pdf
cd gb2pdf 
bun install
```

### Convert GitBook to PDF 🎯
```bash
# Interactive mode
bun pdf

# Direct conversion
bun pdf --url https://your-gitbook.io

# Generate single merged PDF
bun pdf --url https://your-gitbook.io --merge
```

## 🚀 Features

- **⚡ Lightning Fast**: Parallel processing with configurable concurrency
- **🔄 Resume Support**: Continue interrupted conversions
- **📄 Merge Option**: Combine all pages into single PDF
- **🎯 Smart Filtering**: Include/exclude patterns with regex support
- **⌨️ Interactive Controls**: Control conversion while running (q/r/o)
- **📊 Progress Tracking**: Real-time progress with detailed statistics
- **🎨 Quality Options**: Multiple quality presets (low/medium/high)
- **📐 Format Support**: A4, A3, and Letter formats
- **🗂️ Auto Organization**: Categorizes PDFs into folders
- **🔧 Robust Error Handling**: Retry logic with exponential backoff
- **📱 Element Hiding**: Removes navigation for clean PDFs
- **📈 Performance Monitoring**: Tracks conversion speed and file sizes

## 🛠️ Requirements

- [Bun](https://bun.sh) (latest version recommended)

## 💡 Usage

### Merge Mode Prompt

If you don't specify the `--merge` flag, the converter will ask you:

```
📄 PDF Output Options:
1. Individual PDFs (organized by category)
2. Single merged PDF (all content in one file)

Would you like to create a single merged PDF? (y/N):
```

### Basic Usage

While the conversion is running, you can use these keyboard shortcuts:

- **`q`** - Quit gracefully (saves progress)
- **`r`** - Restart conversion from beginning  
- **`o`** - Open output folder in file manager
- **`Ctrl+C`** - Force quit

```bash
# Interactive mode with prompts
bun pdf

# Direct URL conversion
bun pdf --url https://docs.example.com

# Specify output directory
bun pdf -u https://docs.example.com -o ./my-pdfs
```

### Advanced Options

```bash
# High-performance conversion
bun pdf \
  --url https://docs.example.com \
  --concurrency 8 \
  --quality high \
  --format A3

# Resume previous conversion
bun pdf --url https://docs.example.com --resume

# Generate merged PDF
bun pdf --url https://docs.example.com --merge --quality high

# Selective conversion with filters
bun pdf \
  --url https://docs.example.com \
  --include ".*/api/.*" \
  --exclude ".*/internal/.*" \
  --exclude ".*/deprecated/.*"

# Custom configuration
bun pdf \
  --url https://docs.example.com \
  --concurrency 6 \
  --delay 500 \
  --retries 5 \
  --timeout 45000 \
  --no-hide-elements
```

## 🔧 CLI Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--url` | `-u` | - | GitBook URL (required) |
| `--output` | `-o` | `./pdfs` | Output directory |
| `--concurrency` | `-c` | `4` | Concurrent PDF processes |
| `--retries` | `-r` | `3` | Retry attempts for failed pages |
| `--delay` | `-d` | `1000` | Delay between requests (ms) |
| `--hide-elements` | - | `true` | Hide navigation elements |
| `--format` | - | `A4` | PDF format (A4/A3/Letter) |
| `--quality` | - | `medium` | PDF quality (low/medium/high) |
| `--resume` | - | `false` | Resume previous conversion |
| `--include` | - | `[]` | Include URL patterns (regex) |
| `--exclude` | - | `[]` | Exclude URL patterns (regex) |
| `--timeout` | - | `30000` | Request timeout (ms) |
| `--merge` | - | `false` | Merge all pages into single PDF |
| `--help` | `-h` | - | Show help message |

## 📂 Output Structure

### Individual PDFs
```
pdfs/
├── 📁 getting-started/
│   ├── 001_installation.pdf
│   └── 002_quick-start.pdf
├── 📁 api/
│   ├── 003_authentication.pdf
│   ├── 004_endpoints.pdf
│   └── 005_examples.pdf
├── 📁 guides/
│   └── 006_advanced-usage.pdf
└── .progress.json          # Resume data
```

### Merged PDF
```
pdfs/
├── merged-gitbook.pdf      # Single merged PDF
└── .progress.json          # Resume data
```

## 🎯 Use Cases

### Documentation Teams
```bash
# Convert entire documentation site
bun pdf --url https://docs.company.com --concurrency 8 --quality high
```

### API Documentation
```bash
# Convert only API docs
bun pdf --url https://docs.api.com --include ".*/api/.*" --format A3
```

### Merged Documentation
```bash
# Create single PDF for easy sharing
bun pdf --url https://company-docs.com --merge --quality high
```

### Offline Reading
```bash
# Quick conversion for offline reading
bun pdf --url https://guide.framework.com --quality medium
```

### CI/CD Integration
```bash
# Automated PDF generation in CI
bun pdf --url $DOCS_URL --output ./dist/pdfs --no-hide-elements
```

## 🚀 Performance

### Benchmarks
- **Speed**: 3-8x faster than sequential processing
- **Memory**: Optimized for large documentation sites
- **Concurrency**: Handles 50+ pages efficiently
- **Resume**: Zero data loss on interruption

### Optimization Tips
1. **Increase concurrency** for powerful machines: `--concurrency 10`
2. **Use low quality** for drafts: `--quality low`
3. **Filter unnecessary pages** with `--exclude`
4. **Enable resume** for large sites: `--resume`
5. **Use merge** for single document: `--merge`

## 🔍 Filtering Examples

### Include specific sections
```bash
--include ".*/guides/.*" --include ".*/api/.*"
```

### Exclude admin/internal pages
```bash
--exclude ".*/admin/.*" --exclude ".*/internal/.*"
```

### Complex filtering
```bash
--include ".*/v2/.*" --exclude ".*/v2/deprecated/.*"
```

## 🛠️ Dependencies

- **puppeteer** - Headless Chrome for PDF generation
- **xml2js** - XML sitemap parsing
- **Bun APIs** - File I/O, HTTP, and process management

## 🐛 Troubleshooting

### Common Issues

**Timeout Errors**
```bash
# Increase timeout for slow pages
bun pdf --url https://docs.example.com --timeout 60000
```

**Memory Issues**
```bash
# Reduce concurrency for limited memory
bun pdf --url https://docs.example.com --concurrency 2
```

**Failed Pages**
```bash
# Increase retries for unstable connections
bun pdf --url https://docs.example.com --retries 5
```

**Resume Conversion**
```bash
# Continue where you left off
bun pdf --url https://docs.example.com --resume
```

### Debug Mode

For troubleshooting, failed pages generate error screenshots:
```
pdfs/category/001_page_error.png
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development

```bash
# Clone and setup
git clone https://github.com/yourusername/gb2pdf
cd gb2pdf
bun install

# Run with development features
bun run index.ts --help
```

## 📊 Statistics

After conversion, gb2pdf shows detailed statistics:
- ✅ Successful conversions
- ❌ Failed attempts  
- 📁 Total file size
- ⏱️ Processing time
- 📊 Average metrics

## 🔐 Privacy & Security

- No data sent to external services
- All processing happens locally
- No storage of GitBook credentials
- Respects robots.txt and rate limits

## 📝 License

MIT License © 2025 Ian Irizarry

## 🙏 Acknowledgments

- Built with ❤️ using [Bun](https://bun.sh)
- Powered by [Puppeteer](https://pptr.dev)
- Inspired by the need for offline documentation

---

<div align="center">
  <strong>⭐ Star this repo if you find it useful! ⭐</strong>
</div>

<div align="center">
  <a href="https://github.com/yourusername/gb2pdf/issues">Report Bug</a> • 
  <a href="https://github.com/yourusername/gb2pdf/issues">Request Feature</a> • 
  <a href="https://github.com/yourusername/gb2pdf/discussions">Discussions</a>
</div>
