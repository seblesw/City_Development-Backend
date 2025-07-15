const fs = require("fs");
const { parse } = require("csv-parse");

const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    let lineNumber = 0;
    let rawLines = [];

    // Read file content for debugging
    rawLines = fs.readFileSync(filePath, "utf8").split(/\r?\n/); // Split on \n or \r\n

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true, // Treat first row as headers
          skip_empty_lines: true, // Skip empty lines
          trim: true, // Trim whitespace
          cast: true, // Convert strings to native types
          delimiter: ",", // CSV delimiter
          bom: true, // Handle UTF-8 BOM
          relax_quotes: true, // Allow unescaped quotes
          escape: "\\", // Use backslash for escaping
          ltrim: true, // Trim leading whitespace
          rtrim: true, // Trim trailing whitespace
          record_delimiter: ["\r\n", "\n"], // Handle both Windows and Unix line endings
        })
      )
      .on("data", (row) => {
        lineNumber++;
        results.push(row);
      })
      .on("error", (error) => {
        console.error(`CSV parsing error at line ${lineNumber + 1}: ${error.message}`);
        console.error(`Header (line 1): "${rawLines[0]}"`);
        console.error(`First data row (line 2): "${rawLines[1] || "N/A"}"`);
        console.error(`Raw bytes of header: ${Buffer.from(rawLines[0]).toString("hex")}`);
        console.error(`Raw bytes of first data row: ${Buffer.from(rawLines[1] || "").toString("hex")}`);
        reject(new Error(`CSV ፋይል መተንተን አልተሳካም፡ ${error.message}`));
      })
      .on("end", () => {
        console.log(`Parsed ${results.length} rows from CSV`);
        resolve(results);
      });
  });
};

module.exports = { parseCSVFile };