# gb2pdf

`gb2pdf` is a project designed to convert GB (possibly referring to a specific file format or data type) to PDF format. This project leverages several libraries to handle XML parsing, HTTP requests, and PDF generation.

## Prerequisites

- [Bun](https://bun.sh) v1.2.4 or later is required to run this project. Bun is a fast all-in-one JavaScript runtime.
- Node.js and npm should be installed if you plan to use npm for package management.

## Installation

To install the necessary dependencies, run:

```bash
bun install
```

This will install all required packages as specified in the `package.json` file.

## Usage

To run the project, execute:

```bash
bun run index.ts
```

This command will start the main script located in `index.ts`.

## Project Structure

- `index.ts`: The main entry point of the application.
- `types.ts`: Contains TypeScript type definitions used throughout the project.
- `tsconfig.json`: TypeScript configuration file.
- `package.json`: Contains metadata about the project and its dependencies.
- `bun.lock`: Lock file for Bun to ensure consistent installs.

## Dependencies

The project relies on the following key dependencies:

- `axios`: For making HTTP requests.
- `puppeteer`: For generating PDFs from HTML content.
- `xml2js`: For parsing XML data.

## Development

This project uses TypeScript, and the development dependencies include:

- `@types/bun`: Type definitions for Bun.
- `typescript`: TypeScript language support.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## Acknowledgments

This project was created using `bun init` in Bun v1.2.4.
