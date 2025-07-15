const fs = require("fs");
const { parse } = require("csv-parse");

const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          cast: (value, context) => {
            if (value === "") return null;
            return value;
          },
        })
      )
      .on("data", (row) => {
        console.log(`Parsed row columns: ${Object.keys(row).length}`, Object.keys(row));
        results.push(row);
      })
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
};

module.exports = { parseCSVFile };