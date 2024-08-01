
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


    this.x2.attr('transform', 'translate(0,' + (this.HEIGHT - this.MARGINS.bottom) + ')').call(this.xAxis);
    this.y2.attr('transform', 'translate(' + (this.MARGINS.left) + ',0)').call(this.yAxis);



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

};


/**
 * When zoom or resize, we need to reset the axis
 */
plotit.prototype.reset_axis = function () {
    this.x2.call(this.xAxis);
    this.y2.call(this.yAxis);
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

plotit.prototype.resetzoom = function () {
    while (this.xscales.length > 1) { this.xscales.pop(); }
    while (this.yscales.length > 1) { this.yscales.pop(); }
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


    this.x2 = this.vis.append('svg:g')
        .attr('class', 'xaxis')
        .attr('transform', 'translate(0,' + (this.HEIGHT - this.MARGINS.bottom) + ')')
        .call(this.xAxis);


    this.y2 = this.vis.append('svg:g')
        .attr('class', 'yaxis')
        .attr('transform', 'translate(' + (this.MARGINS.left) + ',0)')
        .call(this.yAxis);


    this.vis.append("text")
        .attr("class", "xlabel")
        .attr("text-anchor", "center")
        .attr("x", this.WIDTH / 2)
        .attr("y", this.HEIGHT)
        .text("Proton Chemical Shift (ppm)");

    this.vis.append("text")
        .attr("class", "ylabel")
        .attr("text-anchor", "center")
        .attr("y", this.HEIGHT / 2)
        .attr("x", 6)
        .attr("cx", 0).attr("cy", 0)
        .attr("transform", "rotate(-90 12," + this.HEIGHT / 2 + ")")
        .text("Carbon chemical shift (ppm)");


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
            /**
             * Show tool tip
             */
            tooldiv.style("opacity", 1.0);
            let coordinates = [event.offsetX,event.offsetY];
            let x_ppm = self.xRange.invert(coordinates[0]);
            let y_ppm = self.yRange.invert(coordinates[1]);
            tooldiv.html(x_ppm.toFixed(3) + " " + y_ppm.toFixed(2) + " ")
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY + 12) + "px");

            if(self.horizontal) {
                /**
                 * Show cross section along x-axis (direct dimension).
                 * 1. Find the closest point in the data hsqc_spectra[0].raw_data (1D Float32 array with size hsqc_spectra[0].n_direct*hsqc_spectra[0].n_indirect)
                 * Along direct dimension, ppm are from hsqc_spectra[0].x_ppm_start to hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[0].y_ppm_start to hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let currect_vis_x_ppm_start = self.xscale[0];
                let currect_vis_x_ppm_end = self.xscale[1];

                /**
                 * However, currect_vis_x_ppm_start and currect_vis_x_ppm_end must both 
                 * be within the range of hsqc_spectra[0].x_ppm_start to hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct
                 */
                if(currect_vis_x_ppm_start > hsqc_spectra[0].x_ppm_start) {
                    currect_vis_x_ppm_start = hsqc_spectra[0].x_ppm_start;
                }
                if(currect_vis_x_ppm_end < hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct) {
                    currect_vis_x_ppm_end = hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct;
                }

                let x_pos_start = Math.floor((currect_vis_x_ppm_start -  hsqc_spectra[0].x_ppm_start)/ hsqc_spectra[0].x_ppm_step);
                let x_pos_end = Math.floor((currect_vis_x_ppm_end - hsqc_spectra[0].x_ppm_start)/hsqc_spectra[0].x_ppm_step);
                let y_pos = Math.floor((y_ppm - hsqc_spectra[0].y_ppm_start)/hsqc_spectra[0].y_ppm_step);

                /**
                 * if y_pos is out of range, do nothing and return
                 */
                if(y_pos < 0 || y_pos >= hsqc_spectra[0].n_indirect) {
                    return;
                }

                /**
                 * Get the data from hsqc_spectra[0].raw_data, at row y_pos, from column x_pos_start to x_pos_end
                 */
                let data_height = hsqc_spectra[0].raw_data.slice(y_pos *  hsqc_spectra[0].n_direct + x_pos_start, y_pos *  hsqc_spectra[0].n_direct + x_pos_end);
                /**
                 * Get ppm values for the data, which is an array stats from hsqc_spectra[0].x_ppm_start + x_pos_start * hsqc_spectra[0].x_ppm_step
                 * to hsqc_spectra[0].x_ppm_start + x_pos_end * hsqc_spectra[0].x_ppm_step
                 */
                let data_ppm = [];
                for(let i = x_pos_start; i < x_pos_end; i++) {
                    data_ppm.push(hsqc_spectra[0].x_ppm_start + i * hsqc_spectra[0].x_ppm_step);
                }
                /**
                 * Combine data_ppm and data_height to form an array of 2 numbers, called data
                 */
                let data = [];
                for(let i = 0; i < data_ppm.length; i++) {
                    data.push([data_ppm[i], data_height[i]]);
                }

                /**
                 * Draw a line plot of the data, using same xRange
                 * yRange is a new range, which is 100 pixels above the current y position, corresponding to max data_height 
                 * and 100*scale pixels above the current y position, where scale = min_data_height/max_data_height
                 */
                let data_max = d3.max(data_height);
                let data_min = d3.min(data_height);
                /**
                 * Set data_min to 0 if data_min is positive
                 */
                if(data_min > 0) {
                    data_min = 0;
                }

                let cross_section_yRange = d3.scaleLinear().range([coordinates[1]-100*data_min/data_max,coordinates[1]-100]).domain([data_min, data_max]);

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
                 * 1. Find the closest point in the data hsqc_spectra[0].raw_data (1D Float32 array with size hsqc_spectra[0].n_direct*hsqc_spectra[0].n_indirect)
                 * Along direct dimension, ppm are from hsqc_spectra[0].x_ppm_start to hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[0].y_ppm_start to hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let currect_vis_y_ppm_start = self.yscale[0];
                let currect_vis_y_ppm_end = self.yscale[1];

                /**
                 * However, currect_vis_y_ppm_start and currect_vis_y_ppm_end must both 
                 * be within the range of hsqc_spectra[0].y_ppm_start to hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect
                 */
                if(currect_vis_y_ppm_start > hsqc_spectra[0].y_ppm_start) {
                    currect_vis_y_ppm_start = hsqc_spectra[0].y_ppm_start;
                }
                if(currect_vis_y_ppm_end < hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect) {
                    currect_vis_y_ppm_end = hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect;
                }

                let y_pos_start = Math.floor((currect_vis_y_ppm_start -  hsqc_spectra[0].y_ppm_start)/ hsqc_spectra[0].y_ppm_step);
                let y_pos_end = Math.floor((currect_vis_y_ppm_end - hsqc_spectra[0].y_ppm_start)/hsqc_spectra[0].y_ppm_step);
                let x_pos = Math.floor((x_ppm - hsqc_spectra[0].x_ppm_start)/hsqc_spectra[0].x_ppm_step);

                /**
                 * if x_pos is out of range, do nothing and return
                 */
                if(x_pos < 0 || x_pos >= hsqc_spectra[0].n_direct) {
                    return;
                }

                /**
                 * Get the data from hsqc_spectra[0].raw_data, at column x_pos, from row y_pos_start to y_pos_end
                 * Along direct dimension, ppm are from hsqc_spectra[0].x_ppm_start to hsqc_spectra[0].x_ppm_start + hsqc_spectra[0].x_ppm_step * hsqc_spectra[0].n_direct
                 * Along indirect dimension, ppm are from hsqc_spectra[0].y_ppm_start to hsqc_spectra[0].y_ppm_start + hsqc_spectra[0].y_ppm_step * hsqc_spectra[0].n_indirect
                 * So, x_ppm ==> x_ppm_start + x_ppm_step * x_pos, y_ppm ==> y_ppm_start + y_ppm_step * y_pos.
                 * So, x_pos = (x_ppm - x_ppm_start)/x_ppm_step, y_pos = (y_ppm - y_ppm_start)/y_ppm_step
                 */
                let data_height = [];
                for(let i = y_pos_start; i < y_pos_end; i++) {
                    data_height.push(hsqc_spectra[0].raw_data[i *  hsqc_spectra[0].n_direct + x_pos]);
                }
                /**
                 * Get ppm values for the data, which is an array stats from hsqc_spectra[0].y_ppm_start + y_pos_start * hsqc_spectra[0].y_ppm_step
                 * to hsqc_spectra[0].y_ppm_start + y_pos_end * hsqc_spectra[0].y_ppm_step
                 */
                let data_ppm = [];
                for(let i = y_pos_start; i < y_pos_end; i++) {
                    data_ppm.push(hsqc_spectra[0].y_ppm_start + i * hsqc_spectra[0].y_ppm_step);
                }
                /**
                 * Combine data_ppm and data_height to form an array of 2 numbers, called data
                 */
                let data = [];
                for(let i = 0; i < data_ppm.length; i++) {
                    data.push([data_ppm[i], data_height[i]]);
                }

                /**
                 * Draw a line plot of the data, using same yRange
                 * xRange is a new range, which is 100 pixels above the current x position, corresponding to max data_height
                 * and 100*scale pixels above the current x position, where scale = min_data_height/max_data_height
                 */
                let data_max = d3.max(data_height);
                let data_min = d3.min(data_height);
                /**
                 * Set data_min to 0 if data_min is positive
                 */
                if(data_min > 0) {
                    data_min = 0;
                }

                let cross_section_xRange = d3.scaleLinear().range([coordinates[0]+100*data_min/data_max,coordinates[0]+100]).domain([data_min, data_max]);

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
            tooldiv.style("opacity", 0.0);
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

