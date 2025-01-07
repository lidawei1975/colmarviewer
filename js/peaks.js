/**
 * Define the peaks object, to store peak parameters of a spectrum
 * and peak processing methods.
 */


class peaks {
    constructor() {
        this.comments = []; // comments, string array
        this.number_of_columns = 0;
        this.column_headers = []; // column headers, string array
        this.column_formats = []; // column formats, string array
        this.columns = []; // columns, array of arrays (arrays have same length, but different types)
    };

    /**
     * A class method to process a peaks.tab file (nmrPipe format)
     * @param {string} peaks_tab - the peaks.tab file content as one big string, separated by newlines
     */
    process_peaks_tab(peaks_tab) {

        const lines = peaks_tab.split('\n');

        /**
         * Put lines starts with DATA into this.comments
         */
        this.comments = lines.filter(line => line.startsWith('DATA'));

        // Extract headers from the VARS line
        const varsLine = lines.find(line => line.startsWith('VARS'));
        this.column_headers = varsLine.split(/\s+/).slice(1);

        // Extract formats from the FORMAT line
        const formatLine = lines.find(line => line.startsWith('FORMAT'));
        this.column_formats = formatLine.split(/\s+/).slice(1);
      
        // Extract data rows (skipping lines starting with VARS and FORMAT)
        const dataRows = lines.filter(line => !line.startsWith('VARS') && !line.startsWith('FORMAT') && !line.startsWith('DATA') && line.trim());
      
        /**
         * Split data rows into columns and save each column as an array in this.columns
         * IF column format contains " %3s" or " %4s, etc., treat it as a string
         * ELSE if column format contains " %4d", "%1d", %d, etc., treat it as an integer
         * ELSE treat it as a float
         */
        this.columns = this.column_headers.map((header, index) => {
          return dataRows.map(row => {
            const value = row.split(/\s+/)[index];
            if (this.column_formats[index].includes('s')) {
              return value;
            } else if (this.column_formats[index].includes('d')) {
              return parseInt(value);
            } else {
              return parseFloat(value);
            }
          });
        });
    };

    /**
     * A class method to change all values in a column by add,sub,mul,div a value.
     * @param {string} column_header_name - the column header name
     * @param {string} operation - the operation to be performed: add, sub, mul, div
     * @param {number} value - the value to be added, subtracted, multiplied, or divided
     * @return {boolean} - true if the column is successfully changed, false if the column is not found, not a number, or the operation is invalid
     */
    change_column(column_header_name, operation, value) {
        let index = this.column_headers.indexOf(column_header_name);
        if (index === -1) {
            return false;
        }
        if (isNaN(value)) {
            return false;
        }

        /**
         * Check column_formats[index] to determine the type of the column, must be float or integer
         */
        if (this.column_formats[index].includes('s')) {
            return false;
        }

        if (operation === 'add') {
            this.columns[index] = this.columns[index].map(x => x + value);
        } else if (operation === 'sub') {
            this.columns[index] = this.columns[index].map(x => x - value);
        } else if (operation === 'mul') {
            this.columns[index] = this.columns[index].map(x => x * value);
        } else if (operation === 'div') {
            this.columns[index] = this.columns[index].map(x => x / value);
        } else {
            return false;
        }
        return true;
    }

    /**
     * Class method to save the peaks object as a peaks.tab file (nmrPipe format)
     */
    save_peaks_tab() {
        let peaks_tab = '';
        peaks_tab += this.comments.join('\n') + '\n';
        peaks_tab += 'VARS ' + this.column_headers.join(' ') + '\n';
        peaks_tab += 'FORMAT ' + this.column_formats.join(' ') + '\n';
        for (let i = 0; i < this.columns[0].length; i++) {
            let row = '';
            for (let j = 0; j < this.columns.length; j++) {
                /**
                 * Simulate a c++ sprintf function to format the value according to column_formats[j]
                 */
                if (this.column_formats[j].includes('s')) {
                    row += this.columns[j][i].toString().padEnd(parseInt(this.column_formats[j]), ' ');
                }
                else if (this.column_formats[j].includes('d')) {
                    row += this.columns[j][i].toFixed(0).padStart(parseInt(this.column_formats[j]), ' ');
                }
                else if (this.column_formats[j].includes('f')) {
                    /**
                     * Get number of decimal places from column_formats[j]
                     * Use toFixed to format the number to that many decimal places
                     */
                    let decimal_places = parseInt(this.column_formats[j].split('.')[1]);
                    row += this.columns[j][i].toFixed(decimal_places).padStart(parseInt(this.column_formats[j]), ' ');
                }
                else if (this.column_formats[j].includes('e')) {
                    /**
                     * Get number of decimal places from column_formats[j]
                     * Use toExponential to format the number to that many decimal places
                     */
                    let decimal_places = parseInt(this.column_formats[j].split('.')[1]);
                    row += this.columns[j][i].toExponential(decimal_places).padStart(parseInt(this.column_formats[j]), ' ');
                }
                else {
                    /**
                     * If column format is not recognized, just pad the value with spaces
                     */
                    row += this.columns[j][i].toString()+ ' ';
                }
            }
            peaks_tab += row + '\n';
        }
        return peaks_tab;
    }


    /**
     * A class method to process a peaks.list file (Sparky format)
     * @param {string} peaks_list - the peaks.list file content as one big string, separated by newlines
     */
    process_peaks_list(peaks_list) {
            
        };

    /**
     * A class method to extract x,y coordinates from a peaks object
     */
    get_xy() {
        let x = [];
        let y = [];
        for (let i = 0; i < this.columns.length; i++) {
            x.push(this.columns[i][0]);
            y.push(this.columns[i][1]);
        }
        return [x, y];
    };

};
