//function text is modified to use intergral instead of index(intensity) 

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

    this.brushend_time = 0.0;

    this.left = -1000;
    this.righ = 1000;
    this.top = 1000;
    this.bottom = -1000;

    /**
     * For webgl contour
     */
    this.n_direct = input.n_direct;
    this.n_indirect = input.n_indirect;

    this.levels = input.levels;
    

    /**
     * For contour plot in webgl
     */
    this.colors =[[0.7,0.7,0.7,1.0]]; //Default color is gray
    this.overlays = [];
    this.polygon_length = [];
    this.levels_length = [];
    this.points = new Float32Array(0);


    this.drawto_contour = input.drawto_contour;

    this.x_ppm_start = input.x_ppm_start;
    this.x_ppm_step = input.x_ppm_step;
    this.y_ppm_start = input.y_ppm_start;
    this.y_ppm_step = input.y_ppm_step;

    this.cutoff = this.levels[0]*0.99; //Default cutoff is the lowest contour level. 0.99 is to prevent numerical round off error

};

plotit.prototype.update_contour_ref = function (ref1, ref2) {
    /**
     * Update webgl contour's internal variables x_ppm_start and y_ppm_start
     */
    this.contour_plot.update_ppm(ref1, ref2);
    /**
     * update_ppm will cause the contour to be redrawn. So we need to update the camera.
     * But we don't need to update the view
     */
    this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.drawScene();
    }


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
    this.brush_element.selectAll(".overlay").attr("width", this.WIDTH).attr("height", this.HEIGHT);


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

    this.transition_data();

};

//diff with old one, we are using intergral instead of index(height)
plotit.prototype.text = function () {
    var out = "";

    var temp = this.realdata.slice(0);

    temp.sort(function (a, b) { return a.cs_x - b.cs_x; });

    for (var i = 0; i < this.realdata.length; i++) {
        if (typeof temp[i].noise !== "undefined" && temp[i].noise === 0) {
            continue;
        }
        if (typeof temp[i].intergral !== "undefined") {
            out += temp[i].cs_x.toFixed(3) + " " + temp[i].cs_y.toFixed(2) + " " + temp[i].index.toFixed(2) + " " + temp[i].intergral.toFixed(2) + "\n";
        } else {
            out += temp[i].cs_x.toFixed(3) + " " + temp[i].cs_y.toFixed(2) + " " + temp[i].index.toFixed(2) + " " + temp[i].index.toFixed(2) + "\n";
        }
    }

    $(this.drawto_peak).val(out);
};



plotit.prototype.reset_axis = function () {
    this.x2.call(this.xAxis);
    this.y2.call(this.yAxis);
};




/**
 * Oncall function for brushend event
 * @param {event} e 
 */
plotit.prototype.brushend = function (e) {

    /**
     * if e.selection is null, then it is a click event or clear brush event
     */
    if (!e.selection) {
        return;
    }

    this.brushend_zoom(e.selection);
    this.vis.select(".brush").call(this.brush.move, null);
};




plotit.prototype.brushend_zoom = function (selection) {

    var self = this;

    /**
     * selection is a rectangle. Coordinate unit is pixel and origin is top-left corner
     * of the vis svg element (xRange and yRange need to take care of margin)
     */
    if (Math.abs(selection[0][0] - selection[1][0]) < 3.0) {

    } else if (Math.abs(selection[0][1] - selection[1][1]) < 3.0) {

    } else {
        this.xscales.push(this.xscale);
        this.yscales.push(this.yscale);
        this.xscale = [self.xRange.invert(selection[0][0]), self.xRange.invert(selection[1][0])];
        this.yscale = [self.yRange.invert(selection[1][1]), self.yRange.invert(selection[0][1])];
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
        var start = new Date().getTime() + 100;
        this.brushend_time = start;
    }
};

plotit.prototype.brushend_remove = function (selection) {

    if (stage >= 2)
        return;

    var self = this; //self is plotit object

    /**
     * selection is a rectangle. Coordinate unit is pixel and origin is top-left corner
     * Need to convert to ppm
     */
    var ppm_x1= self.xRange.invert(selection[0][0]);
    var ppm_x2= self.xRange.invert(selection[1][0]);
    var ppm_y1= self.yRange.invert(selection[0][1]);
    var ppm_y2= self.yRange.invert(selection[1][1]);

    /**
     * Make sure ppm_x1 < ppm_x2 and ppm_y1 < ppm_y2
     */
    if (ppm_x1 > ppm_x2) {
        var temp = ppm_x1;
        ppm_x1 = ppm_x2;
        ppm_x2 = temp;
    }

    if (ppm_y1 > ppm_y2) {
        var temp = ppm_y1;
        ppm_y1 = ppm_y2;
        ppm_y2 = temp;
    }

    
    for (var i = self.PointData.length - 1; i >= 0; i--) {
        /**
         * If self.PointData[i].cs_x is in the range of ppm_x1 and ppm_x2, 
         * and self.PointData[i].cs_y is in the range of ppm_y1 and ppm_y2
         * then remove this point
         */
        if (self.PointData[i].cs_x >= ppm_x1 && self.PointData[i].cs_x <= ppm_x2 &&
            self.PointData[i].cs_y >= ppm_y1 && self.PointData[i].cs_y <= ppm_y2)
        {
            self.PointData.splice(i, 1);
        }
    }

    self.realdata = [];
    for (var i = 0; i < self.PointData.length; i++) {
        if (self.PointData[i].index > self.cutoff)
            self.realdata.push(self.PointData[i]);
    }


    self.preparedata();
    self.update_picked_peaks();

    /**
     * Track time to prevent brushend event from being called twice in a short time
     */
    self.brushend_time = new Date().getTime() + 100;
    self.text();
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


plotit.prototype.preparedata = function () {

    for (var j = 0; j < this.realdata.length; j++) {
        this.realdata[j].x = this.xRange(this.realdata[j].cs_x);
        this.realdata[j].y = this.yRange(this.realdata[j].cs_y);
    }
};


plotit.prototype.invertdata = function () {
    for (var j = 0; j < this.realdata.length; j++) {
        this.realdata[j].cs_x = this.xRange.invert(this.realdata[j].x);
        this.realdata[j].cs_y = this.yRange.invert(this.realdata[j].y);
    }

};




plotit.prototype.toggle_contour = function (flag) {
    if (typeof flag === "undefined")
        this.show_contour = 1 - this.show_contour;
    else
        this.show_contour = flag;
    this.vis.selectAll(".level").style("opacity", this.show_contour);

};

plotit.prototype.toggle_peak = function (flag) {
    if (typeof flag === "undefined")
        this.show_peak = 1 - this.show_peak;
    else
        this.show_peak = flag;
    this.vis.selectAll(".point").style("opacity", this.show_peak);
    this.vis.selectAll(".point_match").style("opacity", this.show_peak);

};

plotit.prototype.removepeaks = function () {
    this.data1 = [];
    this.data2 = [];
    this.compounds = [];



    this.vis.selectAll(".point_match").data([]).exit().remove();
    this.vis.selectAll(".compound").data([]).exit().remove();
    this.vis.selectAll(".compound2").data([]).exit().remove();


    this.vis
        .selectAll(".point").remove();

    this.realdata = [];
    for (var i = 0; i < this.PointData.length; i++) {
        if (this.PointData[i].index > this.cutoff)
            this.realdata.push(this.PointData[i]);
    }

    this.vis
        .selectAll(".point")
        .data(this.realdata)
        .enter().append("circle")
        .attr("class", "point")
        .attr("clip-path", "url(#clip)")
        .attr("r", 4.0)
        .attr("fill-opacity", 0.0)
        .style("opacity", this.show_peak)
        .attr("stroke", "blue")
        .attr("stroke-width", "1")
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; })
        ;



    this.legend.selectAll(".legend").data([])
        .exit().remove();


    $(this.drawto_legend).height(20);
};


plotit.prototype.addpeaks = function (data1, compounds) {
    var self = this;

    this.data1 = data1;

    this.vis.selectAll(".point")
        .data([])
        .exit().remove();

    this.vis.selectAll(".dss")
        .data([])
        .exit().remove();

    this.vis.selectAll(".dss2")
        .data([])
        .exit().remove();


    this.vis
        .selectAll(".point_match")
        .data(this.data1)
        .enter().append("circle")
        .attr("class", "point_match")
        .attr("clip-path", "url(#clip)")
        .attr("r", function (d) {
            var t;
            if (d.z.length >= 1) t = 4.0;
            else t = 3.0;
            return t;
        })
        .attr("fill-opacity", 0.0)
        .attr("stroke", "black")
        .attr("stroke-width", function (d) {
            var t;
            if (d.z.length > 1) t = 4;
            else if (d.z.length == 1) t = 2;
            else t = 1;
            return t;
        })
        .attr("cx", function (d) { return self.xRange(d.x); })
        .attr("cy", function (d) { return self.yRange(d.y); });


    this.update_compound(compounds);
    this.dolegend();

};

plotit.prototype.color_compound = function (m) {
    data = ['#1f77b4',
        '#ff7f0e',
        '#2ca02c',
        '#d62728',
        '#9467bd',
        '#8c564b',
        '#e377c2',
        '#bcbd22',
        '#17becf'];

    return data[m];
};


plotit.prototype.update_compound = function (compounds, allow_click = 0) {

    var self = this;
    this.compounds = compounds;


    for (var i = 0; i < this.compounds.length; i++) {
        this.compounds[i].show = 1;
        for (var j = 0; j < this.compounds[i].peaks.length; j++)
            this.compounds[i].peaks[j].z = i;
    }

    this.color_compound2 = d3.scaleLinear().rangeRound([0, 8]).domain([0, Math.max(this.compounds.length, 8)]);

    this.vis.selectAll(".compound").data([]).exit().remove();
    this.vis.selectAll(".compound2").data([]).exit().remove();

    const index = d3.local();

    this.compound = this.vis.selectAll(".compound")
        .data(this.compounds)
        .enter().append("g")
        .attr("class", "compound")
        .each(function(d, i) {
            index.set(this, i);  //so that we can access i in on click function
        })
        .style("opacity", function (d) { return d.show; })
        .attr('stroke', function (d, i) { return self.color_compound(self.color_compound2(i)); })
        // if allow_click is 1, then allow click to show one compound
        .on("click", function () { 
            if (allow_click === 1) show_one_compound(index.get(this));
         }) //show_one_compound is defined in colmarm.js (this is not good)
        ;


    this.compound2 = this.compound.selectAll(".compound2")
        .data(function (d) { return d.peaks; }).enter().append("path")
        .attr("class", "compound2")
        //.attr("clip-path", "url(#clip)")
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr("d", function (d, i) { return shapes[d.z % 5]; })
        .attr("transform", function (d) { return "translate(" + self.xRange(d.x) + "," + self.yRange(d.y) + ")"; });
}


plotit.prototype.dolegend = function () {
    var self = this;


    this.legend = d3.select(this.drawto_legend);

    this.legend.selectAll(".legend").remove();
    this.legend.selectAll(".legend2").remove();

    /**
     * Get width of svg element. Remove # from svg id
     */
    let svg_id=this.drawto.substring(1);
    var t = document.getElementById(svg_id).clientWidth;

    if (t < 1024)
        t = 1024;
    t = t - 15;

    var n_perline = Math.round(t / 200 - 0.5);

    const index= d3.local();

    this.legend.selectAll(".legend").data(this.compounds)
        .enter().append("text").attr("class", "legend")
        .attr("x", function (d, i) { return 30 + (i % n_perline) * 200; })
        .attr("y", function (d, i) { return 40 + 20 * Math.round(i / n_perline - 0.5); })
        .style("fill", function (d, i) { return self.color_compound(self.color_compound2(i)); })
        .each(function(d, i) {index.set(this, i);})  //so that we can access i in on click function
        .text(function (d) { return d.name.substring(0, 18); })
        .on("click", function (d, i) { 
            self.legendClick(index.get(this));
        });

    this.legend.selectAll(".legend2").data(this.compounds)
        .enter().append("path").attr("class", "legend2")
        .attr('stroke-width', 2)
        .attr('fill', 'none')
        .attr("d", function (d, i) { return shapes[i % 5]; })
        .attr('stroke', function (d, i) { return self.color_compound(self.color_compound2(i)); })
        .attr("transform", function (d, i) { return "translate(" + ((i % n_perline) * 200 + 10) + "," + (35 + 20 * Math.round(i / n_perline - 0.5)) + ")"; });


    var len = 60 + 20 * Math.round(this.compounds.length / n_perline - 0.5);
    $(this.drawto_legend).height(len);
    $(this.drawto_legend).width(t);
}




plotit.prototype.legendall = function (show) {
    var obj = this;

    for (var i = 0; i < this.compounds.length; i++) {
        this.compounds[i].show = show;
    }

    this.vis.selectAll(".compound")
        //.transition().duration(100)         
        .style("opacity", function (d) { return d.show; });

    this.legend.selectAll(".legend").style("fill", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";

    });

    this.legend.selectAll(".legend2").style("stroke", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";

    });
};


plotit.prototype.show_one = function (index) {
    var obj = this;



    this.vis.selectAll(".compound").style("opacity", function (d, i) {
        if (d.show === 1.0)
            return 1.0;
        else
            return 0.0;
    });



    this.legend.selectAll(".legend").style("fill", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";
    });

    this.legend.selectAll(".legend2").style("stroke", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";
    });
};



plotit.prototype.legendClick = function (index) {
    var obj = this;

    this.compounds[index].show = 1 - this.compounds[index].show;

    this.vis.selectAll(".compound").style("opacity", function (d, i) {
        if (d.show === 1.0)
            return 1.0;
        else
            return 0.0;
    });



    this.legend.selectAll(".legend").style("fill", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";
    });

    this.legend.selectAll(".legend2").style("stroke", function (d, i) {
        if (d.show === 1.0)
            return obj.color_compound(obj.color_compound2(i));
        else
            return "gray";
    });
};

plotit.prototype.update_contour = function (value) {

    /**
     * value-1 because the index of contour starts from 0 but the value starts from 1
     * set_level_lb will call drawScene() to redraw the contour automatically
     */
    this.contour_plot.set_level_lb(value - 1); 

    /**
     * Update cutoff then remove peaks below cutoff
     * PointData is the original peak list
     * realdata is the peak list after cutoff
     */
    this.cutoff = this.levels[value - 1]*0.99; //0.99 is to prevent numerical round off error
    this.realdata = [];
    for (var i = 0; i < this.PointData.length; i++) {
        if (this.PointData[i].index > this.cutoff)
            this.realdata.push(this.PointData[i]);
    }

    this.preparedata();
    this.update_picked_peaks();
};



plotit.prototype.draw_peaks = function () {

    this.realdata = [];
    for (var i = 0; i < this.PointData.length; i++) {
        if (this.PointData[i].index > this.cutoff)
            this.realdata.push(this.PointData[i]);
    }
    this.preparedata();

    this.vis
        .selectAll(".point")
        .data(this.realdata)
        .enter().append("circle")
        .attr("class", "point")
        .attr("clip-path", "url(#clip)")
        .attr("r", 4.0)
        .attr("fill-opacity", 0.0)
        .attr("stroke", "blue")
        .attr("stroke-width", "1")
        .style("opacity", this.show_peak)
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; })
        ;


    this.text();

    var bts = document.getElementsByClassName("compound_button");
    for (var i = 0; i < bts.length; i++)
        bts[i].style.display = "none";

    this.vis.selectAll(".point_match").remove();
    this.data1 = [];
    this.data2 = [];


};

plotit.prototype.update_pointdata = function (input) {
    this.PointData = input;
    this.realdata = [];
    for (var i = 0; i < this.PointData.length; i++) {
        if (this.PointData[i].index > this.cutoff)
            this.realdata.push(this.PointData[i]);
    }
    this.preparedata();

    this.vis
        .selectAll(".point").remove();

    this.vis
        .selectAll(".point")
        .data(this.realdata)
        .enter().append("circle")
        .attr("class", "point")
        .attr("clip-path", "url(#clip)")
        .attr("r", 4.0)
        .attr("fill-opacity", 0.0)
        .attr("stroke", function (d) {
            if (typeof d.noise !== "undefined" && d.noise === 0) {
                return "red";
            } else {
                return "blue";
            }
        })
        .attr("stroke-width", "1")
        .style("opacity", this.show_peak)
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; })
        ;
    this.text();
}


plotit.prototype.update_picked_peaks = function () {

    if (stage < 2) {
        this.vis
            .selectAll(".point").remove();

        this.vis
            .selectAll(".point")
            .data(this.realdata)
            .enter().append("circle")
            .attr("class", "point")
            .attr("clip-path", "url(#clip)")
            .attr("r", 4.0)
            .attr("fill-opacity", 0.0)
            .attr("stroke", function (d) {
                if (typeof d.noise !== "undefined" && d.noise === 0) {
                    return "red";
                } else {
                    return "blue";
                }
            })
            .style("opacity", this.show_peak)
            .attr("stroke-width", "1")
            .attr("cx", function (d) { return d.x; })
            .attr("cy", function (d) { return d.y; })
            ;

        this.text();
    }
}


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

    this.brush = d3.brush()
        .extent([[0, 0], [this.WIDTH, this.HEIGHT]])
        .on("end", this.brushend.bind(this));

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
        .append("rect");

    this.brush_element = this.vis.append("g")
        .attr("class", "brush")
        .call(this.brush);

    this.rect.attr("x", this.MARGINS.left)
        .attr("y", this.MARGINS.top)
        .attr("width", this.WIDTH - this.MARGINS.right - this.MARGINS.left)
        .attr("height", this.HEIGHT - this.MARGINS.bottom - this.MARGINS.top);

    this.vis.on("mousemove", function (event) {
        tooldiv.style("opacity", .9);
        var temp = d3.pointer(event);
        tooldiv.html(self.xRange.invert(temp[0]).toFixed(3) + " " + self.yRange.invert(temp[1]).toFixed(2) + " ")
            .style("left", (event.pageX + 12) + "px")
            .style("top", (event.pageY + 12) + "px");
    })
        .on("mouseout", function (d) {
            tooldiv.style("opacity", 0.0);
            document.activeElement.blur();
        });


    /**
     * Draw contour on the canvas, which is a background layer
     */
    this.contour_plot = new webgl_contour_plot(this.drawto_contour);
    this.contour_plot.set_spectrum_information(this.x_ppm_start, this.x_ppm_step, this.y_ppm_start, this.y_ppm_step, this.n_direct, this.n_indirect);
    this.contour_plot.set_data(this.points, this.polygon_length, this.levels_length,this.overlays,this.colors);
};

plotit.prototype.redraw_contour = function ()
{
    this.contour_plot.setCamera_ppm(this.xscale[0], this.xscale[1], this.yscale[0], this.yscale[1]);
    this.contour_plot.set_data(this.points, this.polygon_length, this.levels_length,this.overlays,this.colors);
    this.contour_plot.drawScene();
}



//redraw peaks lines , reference peaks after ref adjust in main JS code. 
plotit.prototype.doref = function () {
    var self = this;

    this.preparedata();

    this.vis
        .selectAll(".point")
        //.transition()
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });

    this.vis.selectAll(".line")
        //.transition()   
        .attr('d', function (d) { return self.lineFunc(d); });
    this.text();


    if (typeof this.dss !== "undefined") {

        for (var i = 0; i < this.dss.length; i++) {
            this.dss2[i].cs_x = this.dss[i].cs_x;
            this.dss2[i].cs_y = this.dss[i].cs_y;
        }

        for (var j = 0; j < this.dss2.length; j++) {
            this.dss2[j].x = this.xRange(this.dss2[j].cs_x);
            this.dss2[j].y = this.yRange(this.dss2[j].cs_y);
        }

        this.vis
            .selectAll(".dss2")
            .attr("cx", function (d) { return d.x; })
            .attr("cy", function (d) { return d.y; });
    }
};

//show reference compound peak pos
plotit.prototype.dodss = function (data) {
    this.dss = data;

    this.dss2 = [];
    for (var i = 0; i < this.dss.length; i++) {

        this.dss[i].x = this.dss[i].cs_x;
        this.dss[i].y = this.dss[i].cs_y;

        var t = {
            x: this.dss[i].x,
            y: this.dss[i].y,
            cs_x: this.dss[i].cs_x,
            cs_y: this.dss[i].cs_y,
            name: this.dss[i].name,
            color: this.dss[i].color
        };
        this.dss2.push(t);
    }

    this.prepare_dss();

    this.vis.selectAll(".dss").data([]).exit().remove();
    this.vis
        .selectAll(".dss")
        .data(this.dss)
        .enter().append("circle")
        .attr("class", "dss")
        .attr("clip-path", "url(#clip)")
        .attr("r", 4.0)
        .attr("fill-opacity", 0.0)
        .attr("stroke", function (d) {
            return d.color;
        })
        .attr("fill", "red")
        .attr("stroke-width", 2)
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });

    this.vis.selectAll(".dss2").data([]).exit().remove();
    this.vis
        .selectAll(".dss2")
        .data(this.dss2)
        .enter().append("circle")
        .attr("class", "dss2")
        .attr("clip-path", "url(#clip)")
        .attr("r", 4.0)
        .attr("fill-opacity", 0.0)
        .attr("stroke", function (d) {
            return d.color;
        })
        .attr("stroke-width", 1)
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });
};

//show potential ref after auto-calculation
plotit.prototype.ref = function (ref1, ref2) {

    for (var i = 0; i < this.dss.length; i++) {
        this.dss2[i].cs_x = this.dss[i].cs_x - ref1;
        this.dss2[i].cs_y = this.dss[i].cs_y - ref2;
    }

    for (var j = 0; j < this.dss2.length; j++) {
        this.dss2[j].x = this.xRange(this.dss2[j].cs_x);
        this.dss2[j].y = this.yRange(this.dss2[j].cs_y);
    }

    this.vis
        .selectAll(".dss2").transition()
        .attr("cx", function (d) { return d.x; })
        .attr("cy", function (d) { return d.y; });

};