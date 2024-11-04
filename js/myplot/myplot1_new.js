
/**
 * Constructor for plotit object.
 * @param {*} input 
 */
function plotit(input) {
    this.show_peak = 1;


    this.xscales = new Array();
    this.yscales = new Array();


    this.xscale = [input.x_ppm_start, input.x_ppm_start + input.x_ppm_step * input.n_direct];
    this.yscale = [input.y_ppm_start, input.y_ppm_start + input.y_ppm_step * input.n_indirect];

    

    this.HEIGHT = input.HEIGHT;
    this.WIDTH = input.WIDTH;
    this.MARGINS = input.MARGINS;
    this.PointData = input.PointData;
    this.drawto = input.drawto;
    this.drawto_legend = input.drawto_legend;
    this.drawto_peak = input.drawto_peak;
    this.size = input.size;
    this.data1 = [];  //peaks that match compound
    this.data2 = [];  //remove it??


    this.left = -1000;
    this.righ = 1000;
    this.top = 1000;
    this.bottom = -1000;

    this.drawto_contour = input.drawto_contour;

    this.x_ppm_start = input.x_ppm_start;
    this.x_ppm_step = input.x_ppm_step;
    this.y_ppm_start = input.y_ppm_start;
    this.y_ppm_step = input.y_ppm_step;

    /**
     * Flag to draw horizontal and vertical cross section. IF not set in input, default is off
     */
    this.horizontal = input.horizontal ? input.horizontal : false;
    this.vertical = input.vertical ? input.vertical : false;

    this.spectral_order = [];

    this.peak_level = 0.0;

    this.allow_brush_to_remove = false; //default is false

    this.peak_color = "#FF0000"; //default color is red
    this.peak_size = 6;
    this.peak_thickness = 5;


    /**
     * Init cross section plot
     * At this time, height is 200, width is the same as the main plot
     * data is empty
     * x_domain is this.xcale
     * y_domain is [0,1]
     */
    this.x_cross_section_plot = new cross_section_plot();
    this.x_cross_section_plot.init(this.WIDTH, 200, [], this.xscale, [0, 1], "cross_section_svg_x");

};

/**
 * Called when user resize the plot
 * @param {*} input 
 */
plotit.prototype.update = function (input) {

    var self = this;

    this.HEIGHT = input.HEIGHT;
    this.WIDTH = input.WIDTH;


    this.xRange.range([this.MARGINS.left, this.WIDTH - this.MARGINS.right]);
    this.yRange.range([this.HEIGHT - this.MARGINS.bottom, this.MARGINS.top]);


    this.xAxis.scale(this.xRange);
    this.yAxis.scale(this.yRange);


    /**
     * Update brush extent
     */
    this.brush = d3.brush()
    .extent([[0, 0], [this.WIDTH, this.HEIGHT]])
    .on("end", this.brushend.bind(this));

    this.brush_element.call(this.brush);


    this.lineFunc.x(function (d) { return self.xRange(d[0]); })
        .y(function (d) { return self.yRange(d[1]); })
        .curve(d3.curveBasis);


    this.xAxis_svg.attr('transform', 'translate(0,' + (this.HEIGHT - this.MARGINS.bottom) + ')').call(this.xAxis);
    this.yAxis_svg.attr('transform', 'translate(' + (this.MARGINS.left) + ',0)').call(this.yAxis);



    this.vis.selectAll('.xlabel').attr("x", this.WIDTH / 2).attr("y", this.HEIGHT);
    this.vis.selectAll('.ylabel').attr("y", this.HEIGHT / 2).attr("transform", "rotate(-90 12," + this.HEIGHT / 2 + ")");




    this.rect
        .attr("x", this.MARGINS.left)
        .attr("y", this.MARGINS.top)
        .attr("width", this.WIDTH - this.MARGINS.right - this.MARGINS.left)
        .attr("height", this.HEIGHT - this.MARGINS.bottom - this.MARGINS.top);

    /**
     * Update webgl contour. No need to update view
     */
    // this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.drawScene();

    /**
     * Update peaks if there is any
     */
    this.reset_axis();

};


/**
 * When zoom or resize, we need to reset the axis
 */
plotit.prototype.reset_axis = function () {

    let self = this;

    this.xAxis_svg.call(this.xAxis);
    this.yAxis_svg.call(this.yAxis);
    this.vis.selectAll(".xaxis>.tick>text")
        .each(function () {
            d3.select(this).style("font-size", "20px");
        });
    this.vis.selectAll(".yaxis>.tick>text")
        .each(function () {
            d3.select(this).style("font-size", "20px");
        });

    /**
     * Reset the position of peaks
     */
    this.vis.selectAll('.peak')
        .attr('cx', function (d) {
            return self.xRange(d.cs_x);
        })
        .attr('cy', function (d) {
            return self.yRange(d.cs_y);
        });
};



/**
 * Oncall function for brush end event for zooming
 * @param {event} e 
 */
plotit.prototype.brushend = function (e) {

    /**
     * if e.selection is null, then it is a click event or clear brush event
     */
    if (!e.selection) {
        return;
    }

    let self = this;

    /**
     * IF allow_brush_to_remove is true, then do not zoom.
     * Remove all peaks within the brush
     * Remove the brush and return
     */
    if(this.allow_brush_to_remove && self.spectrum != null && self.peak_flag ==='picked') {
        this.vis.select(".brush").call(this.brush.move, null);
        let brush_x_ppm_start = self.xRange.invert(e.selection[0][0]);
        let brush_x_ppm_end   = self.xRange.invert(e.selection[1][0]);
        let brush_y_ppm_start = self.yRange.invert(e.selection[1][1]);
        let brush_y_ppm_end   = self.yRange.invert(e.selection[0][1]);

        /**
         * Make sure brush_x_ppm_start < brush_x_ppm_end and brush_y_ppm_start < brush_y_ppm_end
         * Their order depends on the direction of the brush operation by the user
         */
        if(brush_x_ppm_start > brush_x_ppm_end) {
            [brush_x_ppm_start, brush_x_ppm_end] = [brush_x_ppm_end, brush_x_ppm_start];
        }
        if(brush_y_ppm_start > brush_y_ppm_end) {
            [brush_y_ppm_start, brush_y_ppm_end] = [brush_y_ppm_end, brush_y_ppm_start];
        }

        /**
         * Remove all peaks within the brush.
         * This step can't be undone !!
         */
        let new_peaks = self.spectrum.picked_peaks.filter(peak => peak.cs_x < brush_x_ppm_start || peak.cs_x > brush_x_ppm_end || peak.cs_y < brush_y_ppm_start || peak.cs_y > brush_y_ppm_end);
        self.spectrum.picked_peaks = new_peaks;

        /**
         * Redraw peaks
         */
        self.draw_peaks();

        return;
    }

    this.xscales.push(this.xscale);
    this.yscales.push(this.yscale);
    this.xscale = [self.xRange.invert(e.selection[0][0]), self.xRange.invert(e.selection[1][0])];
    this.yscale = [self.yRange.invert(e.selection[1][1]), self.yRange.invert(e.selection[0][1])];
    /**
     * scale is in unit of ppm.
     */
    this.xRange.domain(this.xscale);
    this.yRange.domain(this.yscale);

    /**
     * Update webgl contour. No change of view is needed here
     */
    this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.drawScene();


    this.reset_axis();

    this.vis.select(".brush").call(this.brush.move, null);
};



plotit.prototype.popzoom = function () {

    if (this.xscales.length > 0) {
        this.xscale = this.xscales.pop();
        this.yscale = this.yscales.pop();
        this.xRange.domain(this.xscale);
        this.yRange.domain(this.yscale);

        /**
        * Update webgl contour. No need to update view
        */
        this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
        this.contour_plot.drawScene();

        this.reset_axis();

    }
};

plotit.prototype.resetzoom = function (x,y) {
    /**
     * Clear the zoom stack
     */
    this.xscales = [];
    this.yscales = [];
    this.xscales.push(x);
    this.yscales.push(y);
    this.popzoom();
};


plotit.prototype.zoomout = function () {
    this.xscales.push(this.xscale);
    this.yscales.push(this.yscale);

    var m1 = this.xscale[0];
    var m2 = this.xscale[1];
    var c = 0.1 * (m1 - m2);
    m1 = m1 + c;
    m2 = m2 - c;
    this.xscale = [m1, m2];

    m1 = this.yscale[0];
    m2 = this.yscale[1];
    c = 0.1 * (m1 - m2);
    m1 = m1 + c;
    m2 = m2 - c;
    this.yscale = [m1, m2];

    this.xRange.domain(this.xscale).nice();
    this.yRange.domain(this.yscale).nice();

    /**
     * Because of nice. The domain may be changed. So we need to update xscale and yscale
     */
    this.xscale = this.xRange.domain();
    this.yscale = this.yRange.domain();

    /**
     * Update webgl contour. No need to update view
     */
    this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.drawScene();
    this.reset_axis();
};



/**
 * Draw the plot, including the contour plot using webgl
 */

plotit.prototype.draw = function () {
    var self = this;

    this.vis = d3.select(this.drawto);


    this.xRange = d3.scaleLinear().range([this.MARGINS.left, this.WIDTH - this.MARGINS.right])
        .domain(this.xscale).nice();

    this.yRange = d3.scaleLinear().range([this.HEIGHT - this.MARGINS.bottom, this.MARGINS.top])
        .domain(this.yscale).nice();

    /**
     * Because of nice. The domain may be changed. So we need to update xscale and yscale
     */
    this.xscale = this.xRange.domain();
    this.yscale = this.yRange.domain();


    this.xAxis = d3.axisBottom(this.xRange);
    this.yAxis = d3.axisLeft(this.yRange);


    this.lineFunc = d3.line()
        .x(function (d) { return self.xRange(d[0]); })
        .y(function (d) { return self.yRange(d[1]); })
        .curve(d3.curveBasis);


    this.vis.selectAll('.xaxis').remove();
    this.vis.selectAll('.yaxis').remove();


    this.xAxis_svg = this.vis.append('svg:g')
        .attr('class', 'xaxis')
        .attr('transform', 'translate(0,' + (this.HEIGHT - this.MARGINS.bottom) + ')');

    this.yAxis_svg = this.vis.append('svg:g')
        .attr('class', 'yaxis')
        .attr('transform', 'translate(' + (this.MARGINS.left) + ',0)');
    
    this.reset_axis();

    this.vis.append("text")
        .attr("class", "xlabel")
        .attr("text-anchor", "center")
        .attr("x", this.WIDTH / 2)
        .attr("y", this.HEIGHT - 20)
        .style("font-size", "22px")
        .text("Chemical Shift (ppm)");

    this.vis.append("text")
        .attr("class", "ylabel")
        .attr("text-anchor", "center")
        .attr("y", this.HEIGHT / 2 + 5)
        .attr("x", 6)
        .attr("cx", 0).attr("cy", 0)
        .attr("transform", "rotate(-90 12," + this.HEIGHT / 2 + ")")
        .style("font-size", "22px")
        .text("Chemical Shift (ppm)");


    this.rect = this.vis.append("defs").append("clipPath")
        .attr("id", "clip")
        .append("rect")
        .attr("x", this.MARGINS.left)
        .attr("y", this.MARGINS.top)
        .attr("width", this.WIDTH - this.MARGINS.right - this.MARGINS.left)
        .attr("height", this.HEIGHT - this.MARGINS.bottom - this.MARGINS.top);

    this.brush = d3.brush()
        .extent([[0, 0], [this.WIDTH, this.HEIGHT]])
        .on("end", this.brushend.bind(this));

    this.brush_element = this.vis.append("g")
        .attr("class", "brush")
        .call(this.brush);

    /**
     * Tool tip for mouse move
     */
    this.vis.on("mousemove", function (event) {

        if(self.timeout) {
            clearTimeout(self.timeout);
        }

        /**
         * Show tool tip only when mouse stops moving for 100ms
         */
        self.timeout = setTimeout(function() {

            if(self.spectral_order.length == 0) {
                /**
                 * No spectral data, do nothing
                 */
                return;
            }

            let spe_index = self.spectral_order[0];

            /**
             * Show tool tip
             */
            tooldiv.style.opacity = 1.0;
            let coordinates = [event.offsetX,event.offsetY];
            let x_ppm = self.xRange.invert(coordinates[0]);
            let y_ppm = self.yRange.invert(coordinates[1]);
            let y_pos = Math.floor((y_ppm - hsqc_spectra[spe_index].y_ppm_ref - hsqc_spectra[spe_index].y_ppm_start)/hsqc_spectra[spe_index].y_ppm_step);
            let x_pos = Math.floor((x_ppm - hsqc_spectra[spe_index].x_ppm_ref - hsqc_spectra[spe_index].x_ppm_start)/hsqc_spectra[spe_index].x_ppm_step);
            let data_height = 0.0; //default value if out of range
            if(x_pos>=0 && x_pos<hsqc_spectra[spe_index].n_direct && y_pos>=0 && y_pos<hsqc_spectra[spe_index].n_indirect) {
                data_height = hsqc_spectra[spe_index].raw_data[y_pos *  hsqc_spectra[spe_index].n_direct + x_pos];
            }
            /**
             * Show current ppm at the top-right corner of the plot in a span element with id "infor" (child of tooldiv)
             */
            document.getElementById("infor").innerHTML 
                = "x_ppm: " + x_ppm.toFixed(3) + ", y_ppm: " + y_ppm.toFixed(2)+ ", Intensity: " + data_height.toExponential(2);
            

            if(self.horizontal) {
                /**
                 * Show cross section along x-axis (direct dimension).
                 * 1. Find the closest point in the data hsqc_spectra[spe_index].raw_data (1D Float32 array with size hsqc_spectra[spe_index].n_direct*hsqc_spectra[spe_index].n_indirect)
                 * Along direct dimension, ppm are from hsqc_spectra[spe_index].x_ppm_start to hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[spe_index].y_ppm_start to hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let currect_vis_x_ppm_start = self.xscale[0];
                let currect_vis_x_ppm_end = self.xscale[1];

                /**
                 * However, currect_vis_x_ppm_start and currect_vis_x_ppm_end must both 
                 * be within the range of hsqc_spectra[spe_index].x_ppm_start to hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct
                 */
                if(currect_vis_x_ppm_start > hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_ref) {
                    currect_vis_x_ppm_start = hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_ref;
                }
                if(currect_vis_x_ppm_end < hsqc_spectra[spe_index].x_ppm_start +hsqc_spectra[spe_index].x_ppm_ref + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct) {
                    currect_vis_x_ppm_end = hsqc_spectra[spe_index].x_ppm_start+hsqc_spectra[spe_index].x_ppm_ref + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct;
                }

                let x_pos_start = Math.floor((currect_vis_x_ppm_start - hsqc_spectra[spe_index].x_ppm_ref - hsqc_spectra[spe_index].x_ppm_start)/ hsqc_spectra[spe_index].x_ppm_step);
                let x_pos_end = Math.floor((currect_vis_x_ppm_end - hsqc_spectra[spe_index].x_ppm_ref - hsqc_spectra[spe_index].x_ppm_start)/hsqc_spectra[spe_index].x_ppm_step);
                let y_pos = Math.floor((y_ppm - hsqc_spectra[spe_index].y_ppm_ref - hsqc_spectra[spe_index].y_ppm_start)/hsqc_spectra[spe_index].y_ppm_step);

                /**
                 * if y_pos is out of range, do nothing and return
                 */
                if(y_pos < 0 || y_pos >= hsqc_spectra[spe_index].n_indirect) {
                    return;
                }

                /**
                 * Get the data from hsqc_spectra[spe_index].raw_data, at row y_pos, from column x_pos_start to x_pos_end
                 */
                let data_height = hsqc_spectra[spe_index].raw_data.slice(y_pos *  hsqc_spectra[spe_index].n_direct + x_pos_start, y_pos *  hsqc_spectra[spe_index].n_direct + x_pos_end);
                /**
                 * Get ppm values for the data, which is an array stats from hsqc_spectra[spe_index].x_ppm_start + x_pos_start * hsqc_spectra[spe_index].x_ppm_step
                 * to hsqc_spectra[spe_index].x_ppm_start + x_pos_end * hsqc_spectra[spe_index].x_ppm_step
                 */
                let data_ppm = [];
                for(let i = x_pos_start; i < x_pos_end; i++) {
                    data_ppm.push(hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_ref + i * hsqc_spectra[spe_index].x_ppm_step);
                }
                /**
                 * Combine data_ppm and data_height to form an array of 2 numbers, called data
                 */
                let data_abs_max = 0.0;
                let data = [];
                for(let i = 0; i < data_ppm.length; i++) {
                    data.push([data_ppm[i], data_height[i], data_height[i]]);
                    if(Math.abs(data_height[i]) > data_abs_max) {
                        data_abs_max = Math.abs(data_height[i]);
                    }
                }
                /**
                 * Draw cross section line plot on the cross_section_svg_x
                 */
                self.x_cross_section_plot.zoom(self.xscale,[-data_abs_max, data_abs_max]);
                self.x_cross_section_plot.update_data(data);

                /**
                 * Define a y range for the cross section line plot
                 * 0: at current coordinates[1]
                 * [-data_abs_max,data_abs_max]: at current [coordinates[1] + 200, coordinates[1] - 200]
                 * Remember that yRange is from top to bottom, +200 is below, -200 is above in the plot
                 */
                let cross_section_yRange = d3.scaleLinear().range([coordinates[1]+200,coordinates[1]-200]).domain([-data_abs_max, data_abs_max]);

                let lineFunc = d3.line()
                    .x(function (d) { 
                        return self.xRange(d[0])
                    })
                    .y(function (d) {
                        return cross_section_yRange(d[1]);
                    })
                    .curve(d3.curveBasis);
                
                self.vis.selectAll('.Horizontal_cross_section').remove();
                self.vis.append('svg:path')
                    .attr('d', lineFunc(data))
                    .attr('stroke', 'black')
                    .attr('stroke-width', 2)
                    .attr('fill', 'none')
                    .attr('class', 'Horizontal_cross_section');
            } //end of horizontal

            if(self.vertical) {
                /**
                 * Show cross section along y-axis (indirect dimension).
                 * 1. Find the closest point in the data hsqc_spectra[spe_index].raw_data (1D Float32 array with size hsqc_spectra[spe_index].n_direct*hsqc_spectra[spe_index].n_indirect)
                 * Along direct dimension, ppm are from hsqc_spectra[spe_index].x_ppm_start to hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[spe_index].y_ppm_start to hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let currect_vis_y_ppm_start = self.yscale[0];
                let currect_vis_y_ppm_end = self.yscale[1];

                /**
                 * However, currect_vis_y_ppm_start and currect_vis_y_ppm_end must both 
                 * be within the range of hsqc_spectra[spe_index].y_ppm_start to hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect
                 */
                if(currect_vis_y_ppm_start > hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_ref) {
                    currect_vis_y_ppm_start = hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_ref;
                }
                if(currect_vis_y_ppm_end < hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_ref + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect) {
                    currect_vis_y_ppm_end = hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_ref + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect;
                }

                let y_pos_start = Math.floor((currect_vis_y_ppm_start - hsqc_spectra[spe_index].y_ppm_ref -  hsqc_spectra[spe_index].y_ppm_start)/ hsqc_spectra[spe_index].y_ppm_step);
                let y_pos_end = Math.floor((currect_vis_y_ppm_end - hsqc_spectra[spe_index].y_ppm_ref - hsqc_spectra[spe_index].y_ppm_start)/hsqc_spectra[spe_index].y_ppm_step);
                let x_pos = Math.floor((x_ppm - hsqc_spectra[spe_index].x_ppm_ref - hsqc_spectra[spe_index].x_ppm_start)/hsqc_spectra[spe_index].x_ppm_step);

                /**
                 * if x_pos is out of range, do nothing and return
                 */
                if(x_pos < 0 || x_pos >= hsqc_spectra[spe_index].n_direct) {
                    return;
                }

                /**
                 * Get the data from hsqc_spectra[spe_index].raw_data, at column x_pos, from row y_pos_start to y_pos_end
                 * Along direct dimension, ppm are from hsqc_spectra[spe_index].x_ppm_start to hsqc_spectra[spe_index].x_ppm_start + hsqc_spectra[spe_index].x_ppm_step * hsqc_spectra[spe_index].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[spe_index].y_ppm_start to hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_step * hsqc_spectra[spe_index].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let data_height = [];
                for(let i = y_pos_start; i < y_pos_end; i++) {
                    data_height.push(hsqc_spectra[spe_index].raw_data[i *  hsqc_spectra[spe_index].n_direct + x_pos]);
                }
                /**
                 * Get ppm values for the data, which is an array stats from hsqc_spectra[spe_index].y_ppm_start + y_pos_start * hsqc_spectra[spe_index].y_ppm_step
                 * to hsqc_spectra[spe_index].y_ppm_start + y_pos_end * hsqc_spectra[spe_index].y_ppm_step
                 */
                let data_ppm = [];
                for(let i = y_pos_start; i < y_pos_end; i++) {
                    data_ppm.push(hsqc_spectra[spe_index].y_ppm_start + hsqc_spectra[spe_index].y_ppm_ref + i * hsqc_spectra[spe_index].y_ppm_step);
                }
                /**
                 * Combine data_ppm and data_height to form an array of 2 numbers, called data
                 */
                let data_abs_max = 0.0;
                let data = [];
                for(let i = 0; i < data_ppm.length; i++) {
                    data.push([data_ppm[i], data_height[i]]);
                    if(Math.abs(data_height[i]) > data_abs_max) {
                        data_abs_max = Math.abs(data_height[i]);
                    }
                }

                /**
                 * Define a x range for the cross section line plot
                 * 0: at current coordinates[0]
                 * [-max_abs_data,max_abs_data]: at current [coordinates[0] -200, coordinates[0] + 200]
                 */
                let cross_section_xRange = d3.scaleLinear().range([coordinates[0]-200,coordinates[0]+200]).domain([-data_abs_max, data_abs_max]);

                let lineFunc = d3.line()
                    .x(function (d) { 
                        return cross_section_xRange(d[1])
                    })
                    .y(function (d) {
                        return self.yRange(d[0]);
                    })
                    .curve(d3.curveBasis);
                
                self.vis.selectAll('.vertical_cross_section').remove();
                self.vis.append('svg:path')
                    .attr('d', lineFunc(data))
                    .attr('stroke', 'black')
                    .attr('stroke-width', 2)
                    .attr('fill', 'none')
                    .attr('class', 'vertical_cross_section');
            } //end of vertical

        }, 200);
    })
        .on("mouseleave", function (d) {
            tooldiv.style.opacity = 0.0;
            document.activeElement.blur();
            /**
             * Remove the cross section line plot. 
             * This is safe even if the line plot is not drawn, because it will remove nothing
             */
            self.vis.selectAll('.Horizontal_cross_section').remove();   
            self.vis.selectAll('.vertical_cross_section').remove();
            if(self.timeout) {
                clearTimeout(self.timeout);
            }
        });



    /**
     * Draw contour on the canvas, which is a background layer
     */
    this.contour_plot = new webgl_contour_plot(this.drawto_contour);
};

plotit.prototype.redraw_contour = function ()
{
    /**
     * Update webgl contour data.
     */
    this.contour_plot.set_data(
        this.spectral_information, /**spectral information */
        this.points, /** actual contour line data in Float32array */
        /**
         * Positive contour data
         */
        this.points_start,
        this.polygon_length,
        this.levels_length,
        this.colors,
        this.contour_lbs,
        /**
         * Negative contour data
         */
        this.points_start_negative,
        this.polygon_length_negative,
        this.levels_length_negative,
        this.colors_negative,
        this.contour_lbs_negative
        );

    this.contour_plot.spectral_order = this.spectral_order;

    this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.drawScene();
}

/**
 * Redraw contour plot with new order of spectra
 */
plotit.prototype.redraw_contour_order = function ()
{
    this.contour_plot.spectral_order = this.spectral_order;
    this.contour_plot.drawScene();   
}

/**
 * Set lowest visible peak level
 */
plotit.prototype.set_peak_level = function (level) {
    this.peak_level = level;
}

/**
 * Set peaks for the plot
 */
plotit.prototype.add_peaks = function (spectrum,flag) {
    this.spectrum = spectrum;
    this.peak_flag = flag;
    this.draw_peaks();
}


/**
 * Draw peaks on the plot
 */
plotit.prototype.draw_peaks = function () {

    let self = this;
    /**
     * Remove all peaks if there is any
     */
    self.vis.selectAll('.peak').remove();

    /**
     * Filter peaks based on peak level
     */
    let new_peaks;
    if(self.peak_flag === 'picked') {
        new_peaks = self.spectrum.picked_peaks.filter(peak => peak.index > self.peak_level);
    }
    else{
        new_peaks = self.spectrum.fitted_peaks.filter(peak => peak.index > self.peak_level);
    }

    /**
     * Draw peaks, red circles without fill
     */
    self.vis.selectAll('.peak')
        .data(new_peaks)
        .enter()
        .append('circle')
        .attr('class', 'peak')
        .attr('cx', function (d) {
            return self.xRange(d.cs_x);
        })
        .attr('cy', function (d) {
            return self.yRange(d.cs_y);
        })
        .attr("clip-path", "url(#clip)")
        .attr('r', self.peak_size)
        .attr('stroke', self.peak_color)
        .attr('fill', 'none')
        .attr('stroke-width', self.peak_thickness);
};

plotit.prototype.redraw_peaks = function () {
    let self = this;
    self.vis.selectAll('.peak')
        .attr('r', self.peak_size)
        .attr('stroke', self.peak_color)
        .attr('fill', 'none')
        .attr('stroke-width', self.peak_thickness);
}

/**
 * Allow peak dragging
 */
plotit.prototype.allow_peak_dragging = function (flag) {

    let self = this;

    const drag = d3.drag()
    .on('start', function (d) {
    })
    .on('drag', function (event,d) {
        d3.select(this).attr('cx', event.x).attr('cy', event.y);
    })
    .on('end', function (event,d) {
        /**
         * Get new coordinates of the peak
         */
        d.cs_x = self.xRange.invert(event.x);
        d.cs_y = self.yRange.invert(event.y);
        /**
         * Check amplitude of the spectrum at the peak position
         * if less than lowest contour level, remove the peak
         */
        let y_pos= Math.floor((d.cs_y - self.spectrum.y_ppm_ref - self.spectrum.y_ppm_start)/self.spectrum.y_ppm_step);
        let x_pos = Math.floor((d.cs_x - self.spectrum.x_ppm_ref - self.spectrum.x_ppm_start)/self.spectrum.x_ppm_step);
        let data_height = 0.0; //default value if out of range
        if(x_pos>=0 && x_pos<self.spectrum.n_direct && y_pos>=0 && y_pos<self.spectrum.n_indirect) {
            data_height = self.spectrum.raw_data[y_pos *  self.spectrum.n_direct + x_pos];
        }
        if(data_height < self.peak_level) {
            if(self.peak_flag === 'picked') {
                self.spectrum.picked_peaks = self.spectrum.picked_peaks.filter(peak => peak.cs_x != d.cs_x || peak.cs_y != d.cs_y);
            }
            d3.select(this).remove();
        }

    });

    if(flag===true){
        self.vis.selectAll('.peak').call(drag);
    }
    else{
        self.vis.selectAll('.peak').on('.drag',null);
    }
}

/**
 * Allow click to add peaks
 */
plotit.prototype.allow_click_to_add_peak = function (flag) {

    let self = this;

    if(flag === true) {
        self.vis.on('click', function (event) {
            let coordinates = d3.pointer(event);
            let x_ppm = self.xRange.invert(coordinates[0]);
            let y_ppm = self.yRange.invert(coordinates[1]);
            /**
                 * Get amplitude of the spectrum at the peak position
                 */
            let y_pos= Math.floor((y_ppm - self.spectrum.y_ppm_ref - self.spectrum.y_ppm_start)/self.spectrum.y_ppm_step);
            let x_pos = Math.floor((x_ppm - self.spectrum.x_ppm_ref - self.spectrum.x_ppm_start)/self.spectrum.x_ppm_step);
            let data_height = 0.0; //default value if out of range
            if(x_pos>=0 && x_pos<self.spectrum.n_direct && y_pos>=0 && y_pos<self.spectrum.n_indirect) {
                data_height = self.spectrum.raw_data[y_pos *  self.spectrum.n_direct + x_pos];
            }
            let new_peak = {
                cs_x: x_ppm,
                cs_y: y_ppm,
                index: data_height,
                type: 1,
                sigmax:  self.spectrum.median_sigmax,
                sigmay:  self.spectrum.median_sigmay,
                gamamx: self.spectrum.median_gammax,
                gamamy: self.spectrum.median_gammay
            };
            if(self.spectrum != null && new_peak.index > self.peak_level)
            {
                self.spectrum.picked_peaks.push(new_peak);
                self.draw_peaks();
            }
        });
    }
    else {
        self.vis.on('click', null);
    }
};

/**
 * Remove peaks from the plot
 */
plotit.prototype.remove_picked_peaks = function () {
    let self = this;
    self.spectrum = null;
    self.vis.selectAll('.peak').remove();
};

/**
 * Get current visible region
 */
plotit.prototype.get_visible_region = function () {
    return [this.xscale[1], this.xscale[0], this.yscale[1], this.yscale[0]];
}