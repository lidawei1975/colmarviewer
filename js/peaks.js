/**
 * Define the peaks object, to store peak parameters of a spectrum
 * and peak processing methods.
 */


class cpeaks {
    constructor() {
        this.comments = []; // comments, string array
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
            /**
             * Clear leading and trailing white spaces
             */
            row = row.trim();
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
     * Get values from a column, as an array
     */
    get_column(column_header_name) {
        let index = this.column_headers.indexOf(column_header_name);
        if (index === -1) {
            return [];
        }
        return this.columns[index];
    };

    /**
     * Copy all data from another peaks object
     */
    copy_data(peaks) {
        this.comments = peaks.comments;
        this.column_headers = peaks.column_headers;
        this.column_formats = peaks.column_formats;
        this.columns = peaks.columns;
    }

    /**
     * Filter a column by a range of values
     * then apply the filter to all columns
     */
    filter_by_column_range(column_header_name, min_value, max_value) {
        let index = this.column_headers.indexOf(column_header_name);
        if (index === -1) {
            return false;
        }
        if (isNaN(min_value) || isNaN(max_value)) {
            return false;
        }
        const indexes = this.columns[index].map((value, index) => (value >= min_value && value <= max_value) ? index : -1)
        .filter((index) => index !== -1);

        /**
         * Apply the filter to all columns
         */
        this.columns = this.columns.map((column) => indexes.map((index) => column[index]));
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
                    /**
                     * Get the number from a string like %4d
                     */
                    let num = parseInt(this.column_formats[j].substring(1, this.column_formats[j].length - 1));
                    row += this.columns[j][i].toFixed(0).padStart(num, ' ');
                }
                else if (this.column_formats[j].includes('f')) {
                    /**
                     * Get number of decimal places from column_formats[j].
                     * First get %5.3f to 5.3
                     * Use toFixed to format the number to that many decimal places
                     */
                    let num = this.column_formats[j].substring(1, this.column_formats[j].length - 1);
                    let decimal_places = parseInt(num.split('.')[1]);
                    let width = parseInt(num.split('.')[0]);
                    row += this.columns[j][i].toFixed(decimal_places).padStart(width, ' ');
                }
                else if (this.column_formats[j].includes('e')) {
                    /**
                     * Get number of decimal places from column_formats[j]
                     * Use toExponential to format the number to that many decimal places
                     */
                    let decimal_places = 6;  //default if not specified
                    let number = this.column_formats[j].substring(1, this.columns[j][i].length - 1);
                    if (number.includes('.')) {
                        decimal_places = number.split('.')[1];
                    }
                    let str = this.columns[j][i].toExponential(decimal_places);
                    /**
                     * Per C++ sprintf, if there is only single digit after the e+ or e-, add a zero
                     */
                    if (str.includes('e+')) {
                        let num = str.split('e+')[1];
                        if (num.length === 1) {
                            str = str.replace('e+', 'e+0');
                        }
                    }
                    if (str.includes('e-')) {
                        let num = str.split('e-')[1];
                        if (num.length === 1) {
                            str = str.replace('e-', 'e-0');
                        }
                    }

                    row += str;
                }
                else {
                    /**
                     * If column format is not recognized, just pad the value with spaces
                     */
                    row += this.columns[j][i].toString()+ ' ';
                }
                /**
                 * Add a space between columns, except for the last column
                 */
                if(j < this.columns.length - 1)
                {
                    row += ' ';
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
