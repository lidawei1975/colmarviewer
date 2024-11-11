class cross_section_plot {
    constructor(url) {

        // test d3 exist
        if (!d3) throw Error('d3 library not set');


        this.data = []; //experimental spectrum, with phase correction applied.
        this.original_data = []; //experimental spectrum before phase correction
        this.data_strided = []; //experimental spectrum that will be plotted at current zoom level and pan position, shallow copy of this.data
    }

    /**
     * 
     * @param {int} width  width of the plot SVG element
     * @param {int} height height of the plot SVG element
     * @param {array} data   //data is an array of [x,y,z] pairs. X: chemical shift, Y: intensity, Z: imaginary_data part of the spectrum. Z might not exist
     * 
     * This function will init the plot and add the experimental spectrum only
     */
    init(width, height, x_domain, y_domain, margin, svg_id, orientation) {

        this.phase_correction = 0.0;
        this.anchor_ppm = 0.0;
        this.phase_correction_p1 = 0.0;


        this.orientation = orientation; //"horizontal" or "vertical"

        this.margin = margin;


        this.width = width;
        this.height = height;

        this.svg_id = svg_id;

        /**
         * Default line width of the experimental spectrum, reconstructed spectrum, and simulated spectrum
         */
        this.exp_line_width = 2.0;

        this.vis = d3.select("#" + this.svg_id)
            .attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("width", this.width)
            .attr("height", this.height);

        this.x = d3.scaleLinear()
            .domain(x_domain)
            .range([this.margin.left, this.width - this.margin.right])
            .nice();

        this.y = d3.scaleLinear()
            .domain(y_domain)
            .range([this.height - this.margin.bottom, this.margin.top])
            .nice();

        this.true_width = this.width - this.margin.left - this.margin.right;
        this.true_height = this.height - this.margin.top - this.margin.bottom;


        /**
         * Define y axis object. Add y axis to the plot and y label for "horizontal" orientation
        */
        if (this.orientation === "horizontal") {
            this.Axis = d3.axisLeft(this.y).ticks(this.true_height / 50.0).tickFormat(d3.format(".1e"));
            this.Axis_element
                = this.vis.append('svg:g')
                    .attr('class', 'yaxis')
                    .attr('transform', 'translate(' + (this.margin.left) + ',0)')
                    .style("stroke-width", 2.5)
                    .call(this.Axis);
        }
        else if (this.orientation === "vertical") {
            this.Axis = d3.axisBottom(this.x).ticks(this.true_width / 50.0).tickFormat(d3.format(".1e"));
            this.Axis_element
                = this.vis.append('svg:g')
                    .attr('class', 'xaxis')
                    .attr('transform', 'translate(0,' + (this.height - this.margin.bottom) + ')')
                    .style("stroke-width", 3.5)
                    .call(this.Axis);
        }

        /**
         * Define line object
         * this.line is a function that will convert data (ppm,amp) to path (screen coordinates)
        */
        this.line = d3.line()
            .x((d) => this.x(d[0]))
            .y((d) => this.y(d[1]))
            ;

        /**
         * Define clip space for the plot. 
        */
        this.clip_space
            = this.vis.append("defs").append("clipPath")
                .attr("id", "clip" + this.orientation)
                .append("rect")
                .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
                .attr("width", width - this.margin.left - this.margin.right)
                .attr("height", height - this.margin.top - this.margin.bottom);

        /**
         * Add a line to show the 0 intensity
         */
        if (this.orientation === "horizontal") {
            this.line_zero = this.vis.append("g")
                .attr("class", "line_zero_g")
                .append("line")
                .attr("clip-path", "url(#clip" + this.orientation + ")")
                .attr("x1", this.x.range()[0])
                .attr("y1", this.y(0))
                .attr("x2", this.x.range()[1])
                .attr("y2", this.y(0))
                .style("stroke", "red")
                .style("stroke-width", 1.5);
        }
        else //vertical
        {
            this.line_zero = this.vis.append("g")
                .attr("class", "line_zero_g")
                .append("line")
                .attr("clip-path", "url(#clip" + this.orientation + ")")
                .attr("x1", this.x(0))
                .attr("y1", this.y.range()[0])
                .attr("x2", this.x(0))
                .attr("y2", this.y.range()[1])
                .style("stroke", "red")
                .style("stroke-width", 1.5);
        }

        /**
         * Handle zoom and pan event
         */
        var self = this;
        this.handleMouseMoveHandler = this.handleMouseMove.bind(this);
        this.vis.on('mousemove', (e) => { self.handleMouseMoveHandler(e); });

        /**
         * mouse drag event to pan the plot
         */
        this.vis.on('mousedown', (e) => {
            e.preventDefault();
            // console.log('mousedown');
            // console.log(e.clientX, e.clientY);
            this.mouse_is_down = true;
            this.mouse_is_moving = false;

            this.handleMouseUpHandler = this.handleMouseUp.bind(this);
            this.vis.on('mouseup', (e) => { self.handleMouseUpHandler(e); });
            // window.addEventListener('mouseup', self.handleMouseUpHandler);
            self.startMousePos = [e.clientX, e.clientY];
        });

        /**
         * mouse wheel event to zoom the plot
         */
        this.vis.on('wheel', (e) => {
            e.preventDefault();
            var delta = e.deltaY;
            
            /**
             * Wheel event:
             * 1. If shift key is pressed, try phase correction
             * 2. If not, zoom in/out
             */
            if (e.shiftKey && this.imagine_exist === true) {
                if(delta > 0) {
                    this.phase_correction -=1/180*Math.PI;
                }
                else {
                    this.phase_correction +=1/180*Math.PI;
                }
                /**
                 * Update real_data and imaginary_data with phase correction
                 */
                if (orientation === "horizontal") {
                    document.getElementById('p0_direct').innerHTML = (this.phase_correction/Math.PI*180).toFixed(1);
                    for (var i = 0; i < this.data.length; i++) {
                        this.data[i][1] = this.real_data[i] * Math.cos(this.phase_correction) + this.imaginary_data[i] * Math.sin(this.phase_correction);
                    }
                   
                }
                else
                {
                    document.getElementById('p0_indirect').innerHTML = (this.phase_correction/Math.PI*180).toFixed(1);
                    for (var i = 0; i < this.data.length; i++) {
                        this.data[i][0] = this.real_data[i] * Math.cos(this.phase_correction) + this.imaginary_data[i] * Math.sin(this.phase_correction);
                    }
                }
                this.redraw();
            }
            else
            {
                if (delta > 0) {
                    delta = 1.1;
                }
                else {
                    delta = 0.9;
                }
                /**
                 * Get the amp of the mouse position. Y zoom only in this plot
                 *
                 * Get top and bottom of the visible range
                 * We need to zoom in/out around the mouse position
                 * So, we need to calculate the new top and bottom of the visible range
                 * Note: Y axis is inverted
                 * So, top is smaller than bottom
                 */
                if (orientation === "horizontal") {
                    let bound = document.getElementById('cross_section_x').getBoundingClientRect();
                    let amp = self.y.invert(e.clientY - bound.top);
                    let top = self.y.domain()[0];
                    let bottom = self.y.domain()[1];
                    let new_top = amp - (amp - top) * delta;
                    let new_bottom = amp + (bottom - amp) * delta;
                    this.y.domain([new_top, new_bottom]);
                }
                else {
                    let bound = document.getElementById('cross_section_y').getBoundingClientRect();
                    let amp = self.x.invert(e.clientX - bound.left);
                    let left = self.x.domain()[0];
                    let right = self.x.domain()[1];
                    let new_left = amp - (amp - left) * delta;
                    let new_right = amp + (right - amp) * delta;
                    this.x.domain([new_left, new_right]);
                }
            }


            this.redraw();
        });
    };

    /**
     * User zoom or pan the plot
     * @param {*} x_domain: new x domain after zooming
     * @param {*} y_domain: new y domain after zooming
     */
    zoom(x_domain, y_domain) {

        this.x.domain(x_domain);
        this.y.domain(y_domain);

        if (this.orientation === "horizontal") {
            this.Axis = d3.axisLeft(this.y).ticks(this.true_height / 50.0).tickFormat(d3.format(".1e"));
            this.Axis_element
                .attr('transform', 'translate(' + (this.margin.left) + ',0)')
                .call(this.Axis);
        }
        else if (this.orientation === "vertical") {
            this.Axis = d3.axisBottom(this.x).ticks(this.true_width / 50.0).tickFormat(d3.format(".1e"));
            this.Axis_element
                .attr('transform', 'translate(0,' + (this.height - this.margin.bottom) + ')')
                .call(this.Axis);
        }

        this.redraw();
    }

    zoom_x(x_domain) {
        this.x.domain(x_domain);
        this.redraw();
    }

    zoom_y(y_domain) {
        this.y.domain(y_domain);
        this.redraw();
    }

    resize_x(width) {
        this.width = width;
        this.x.range([this.margin.left, this.width - this.margin.right]);
        /**
         * Change width of the clip space according to the new width of the main_plot object
         */
        this.clip_space.attr("width", width - this.margin.left - this.margin.right);
        this.redraw();
    }

    resize_y(height) {
        this.height = height;
        this.y.range([this.height - this.margin.bottom, this.margin.top]);
        /**
         * Remove old axis element and add new axis element
         */
        this.vis.selectAll(".xaxis").remove();
        this.Axis_element = this.vis.append('svg:g')
            .attr('class', 'xaxis')
            .attr('transform', 'translate(0,' + (this.height - this.margin.bottom) + ')')
            .style("stroke-width", 3.5)
            .call(this.Axis);
        /**
         * Change height of the clip space according to the new height of the main_plot object
         */
        this.clip_space.attr("height", height - this.margin.top - this.margin.bottom);
        this.redraw();
    }


    update_data(data) {
        /**
         * Remove old experimental spectrum, including "g" element and "path" element
         */
        this.vis.selectAll(".line_exp").remove();
        this.vis.selectAll(".line_exp_g").remove();

        /**
         * data is an array of [x,y,z] pairs. X: chemical shift, Y: intensity, Z: imaginary_data part of the spectrum. Z might not exist (length of Z is 0)
         * Convert to an array of [x,y] pairs. X: chemical shift, Y: intensity or [x,y,z] pairs. X: chemical shift, Y: intensity, Z: imaginary_data part of the spectrum
         */
        if (data[2].length === 0) {
            this.imagine_exist = false;
            this.ppm = data[0];
            this.real_data = data[1];
            this.imaginary_data = [];
        }
        else {
            this.imagine_exist = true;
            this.ppm = data[0];
            this.real_data = data[1];
            this.imaginary_data = data[2];
        }

        this.data = new Array(this.ppm.length);
        if(this.imagine_exist === false)
        {
            if (this.orientation === "horizontal") {
                for (var i = 0; i < data[0].length; i++) {
                    this.data[i] = [this.ppm[i], this.real_data[i]];
                }
            }
            else if (this.orientation === "vertical") {
                for (var i = 0; i < data[0].length; i++) {
                    this.data[i] = [this.real_data[i], this.ppm[i]];
                }
            }
        }
        else
        {
            if (this.orientation === "horizontal") {
                for (var i = 0; i < data[0].length; i++) {
                    this.data[i] = [this.ppm[i], this.real_data[i] * Math.cos(this.phase_correction) + this.imaginary_data[i] * Math.sin(this.phase_correction)];
                }
            }
            else if (this.orientation === "vertical") {
                for (var i = 0; i < data[0].length; i++) {
                    this.data[i] = [this.real_data[i] * Math.cos(this.phase_correction) + this.imaginary_data[i] * Math.sin(this.phase_correction), this.ppm[i]];
                }
            }
        }

        var self = this;

        this.line_exp = this.vis.append("g")
            .attr("class", "line_exp_g")
            .append("path")
            .attr("clip-path", "url(#clip" + this.orientation + ")")
            .data(data)
            .attr("class", "line_exp")
            .attr("fill", "none")
            .style("stroke", "black")
            .style("stroke-width", this.exp_line_width)
            .attr("d", this.line(self.data));

        this.redraw();
    };

    /**
     * Called when user change the size of the plot
     * @param {*} width: new width of the plot
     * @param {*} height: new height of the plot 
     */
    resize(width, height) {

        /**
         * Set DOM element width and height
         */
        document.getElementById(this.svg_id).setAttribute("width", width);
        document.getElementById(this.svg_id).setAttribute("height", height);
        /**
         * Set width and height of the main_plot object. this.width and this.height will be used to calculate 
         * the range of x and y axes to redraw the plot
         */
        this.width = width;
        this.height = height;
        this.true_width = this.width - this.margin.left - this.margin.right;
        this.true_height = this.height - this.margin.top - this.margin.bottom;
        this.x.range([this.width - this.margin.right, this.margin.left]);
        this.y.range([this.height - this.margin.bottom, this.margin.top]);

        /**
         * Reset width and height of the clip space according to the new width and height of the main_plot object
         */
        this.clip_space
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
            .attr("width", width - this.margin.left - this.margin.right)
            .attr("height", height - this.margin.top - this.margin.bottom);


        /**
         * Redraw the plot
         */
        this.redraw();
    }

    /**
     * This function will redraw the plot. 
     * It will be called when the user zooms or pans the plot, resize the plot or replace the experimental spectrum
    */
    redraw() {
        var self = this;
        if (this.line_exp) {
            this.line_exp.attr("d", this.line(this.data)).style("stroke-width", self.exp_line_width);
        }
        this.Axis_element.call(this.Axis);

        /**
         * Update the line that shows the 0 intensity
         */
        if (this.orientation === "horizontal") {
            this.line_zero
                .attr("x1", this.x.range()[0])
                .attr("y1", this.y(0))
                .attr("x2", this.x.range()[1])
                .attr("y2", this.y(0));
        }
        else //vertical
        {
            this.line_zero
                .attr("x1", this.x(0))
                .attr("y1", this.y.range()[0])
                .attr("x2", this.x(0))
                .attr("y2", this.y.range()[1]);
        }
    }

    /**
     * This function will apply phase correction to the experimental spectrum.
     * this.data is an array of [x,y,z] pairs. X is ppm, Y is read part and Z is imaginary_data part of the spectrum
     * @param {double} phase0 phase correction for the experimental spectrum at the left end of the spectrum (smaller ppm)
     * @param {double} phase1 phase correction for the experimental spectrum at the right end of the spectrum (largest ppm)
     * But in visualization, max ppm is drawn on the left and min ppm is drawn on the right.
     * This is opposite to what we save the spectrum in this.data
     */
    apply_phase_correction(phase0, phase1) {

        /**
         * Throw error if phase0 or phase1 is not a number or imagine_exist is false
         */
        if (typeof phase0 != 'number' || typeof phase1 != 'number') {
            throw new Error('colmar_1d_double_zoom function apply_phase_correction phase0 and phase1 must be numbers');
        }
        if (this.imagine_exist === false) {
            throw new Error('colmar_1d_double_zoom function apply_phase_correction cannot apply phase correction because imaginary_data part is not provided');
        }

        /**
         * prevent re-interpretation of this inside some functions. we need to use self sometimes
         */
        var self = this;

        /**
         * var phase_correction is an array of phase correction for each data point. Same length as this.data
         */
        let phase_correction = new Array(this.data.length);
        /**
         * we can calculate the phase correction for each data point using linear interpolation, using index 
         * ppm is linearly spaced. So, we can use index to calculate the phase correction for each data point
         */
        for (var i = 0; i < this.data.length; i++) {
            phase_correction[i] = phase0 + (phase1 - phase0) * i / this.data.length;
        }

        /**
         * Now apply phase correction to the experimental spectrum at each data point
         * y ==> ori_y*cos(phase_correction) + ori_z * sin(phase_correction)
         * z ==> ori_z*cos(phase_correction) - ori_y * sin(phase_correction)
         * Infor: Angle is in radians in JS Math library
         */
        for (var i = 0; i < this.data.length; i++) {
            this.data[i][1] = this.original_data[i][1] * Math.cos(phase_correction[i]) + this.original_data[i][2] * Math.sin(phase_correction[i]);
            this.data[i][2] = this.original_data[i][2] * Math.cos(phase_correction[i]) - this.original_data[i][1] * Math.sin(phase_correction[i]);
        }

        /**
         * Now draw the experimental spectrum with phase correction.
         * this.data_strided is a shallow copy of this.data (share the same data!!)
         */
        this.line_exp.attr("d", self.line(self.data_strided));
    }

    /**
     * This function will set the experimental spectrum to phase corrected spectrum
     * All subsequent phase correction will be applied to the phase corrected spectrum
     */
    permanent_phase_correction() {
        /**
         * Throw error if imagine_exist is false
        */
        if (this.imagine_exist === false) {
            throw new Error('colmar_1d_double_zoom function permanent_phase_correction cannot apply phase correction because imaginary_data part is not provided');
        }
        this.original_data = this.data.map((x) => [x[0], x[1], x[2]]);
    }

    /**
     * Mouse event handler
     */

    handleMouseMove(e) {
        var self = this;


        /**
         * If the mouse is down, we need to pan the plot. Y axis only
         */
        if (this.mouse_is_down == true) {

            this.mouse_is_moving = true;

            if (this.orientation === "horizontal") {
                /**
                 * Convert deltaY intensity
                 */
                let delta_intensity = this.y.invert(e.clientY) - this.y.invert(this.startMousePos[1]);

                /**
                 * Update self.y
                 */
                self.y.domain([self.y.domain()[0] - delta_intensity, self.y.domain()[1] - delta_intensity]);
            }
            else if (this.orientation === "vertical") {
                /**
                 * Convert deltaX intensity
                 */
                let delta_intensity = this.x.invert(e.clientX) - this.x.invert(this.startMousePos[0]);

                /**
                 * Update self.x
                 */
                self.x.domain([self.x.domain()[0] - delta_intensity, self.x.domain()[1] - delta_intensity]);
            }

            /**
             * Update self.startMousePos
             */
            self.startMousePos = [e.clientX, e.clientY];

            /**
             * Redraw the plot
             */
            self.redraw();
        }
        e.preventDefault();
    }

    handleMouseUp(e) {
        e.preventDefault();
        var self = this;
        this.vis.on('mouseup', null);
        this.mouse_is_down = false;
        if(this.mouse_is_moving === false)
        {
            /**
             * If the mouse is not moving, we have a click event.
             * Get the ppm value of the mouse position from the event x
             */
            
            if(this.orientation === "horizontal")
            {
                let ppm = this.x.invert(e.offsetX);
                this.anchor_ppm = ppm;
                document.getElementById('anchor_direct').innerHTML = ppm.toFixed(2);
            }
            else
            {
                let ppm = this.y.invert(e.offsetY);
                this.anchor_ppm = ppm;
                document.getElementById('anchor_indirect').innerHTML = ppm.toFixed(2);
            }
            
            return;
        }
    }

    median(values) {

        if (values.length === 0) {
            throw new Error('Input array is empty');
        }

        // Sorting values, preventing original array
        // from being mutated.
        values = [...values].sort((a, b) => a - b);

        const half = Math.floor(values.length / 2);

        return (values.length % 2
            ? values[half]
            : (values[half - 1] + values[half]) / 2
        );

    }

    /**
     * 
     * get event center position
     * this is actually required when users use two fingers to zoom in or out
     * this is not required when users use mouse wheel to zoom in or out or use mouse to drag the plot
     */


    event_center(event, target, width, height) {
        if (event.sourceEvent) {
            const p = d3.pointers(event, target);
            return [d3.mean(p, d => d[0]), d3.mean(p, d => d[1])];
        }
        return [width / 2, height / 2];
    };

};