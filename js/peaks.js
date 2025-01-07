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

    };

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
