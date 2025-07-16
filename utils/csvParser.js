const fs = require("fs");
const { parse } = require("csv-parse");

const parseCSVFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    let headers = [];

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true, // Allow rows to have more/less columns
          cast: (value, context) => {
            if (value === "") return null;
            return value;
          },
          on_record: (record, context) => {
            if (headers.length === 0) {
              headers = Object.keys(record);
            }
            // Normalize: ensure every expected column exists
            for (const header of headers) {
              if (!(header in record)) {
                record[header] = null;
              }
            }
            return record;
          },
        })
      )
      .on("data", (row) => {
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
