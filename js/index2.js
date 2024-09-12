var heat_data = new Float32Array(201*201);

for(let i=0;i<201;i++){
    for(let j=0;j<201;j++){
      heat_data[i*201+j] = 100*Math.exp((-Math.pow(i-100,2)-Math.pow(j-100,2))/800.0);
    }
}

var colors = new Uint8Array(200*200*6*3);

for(let i=0;i<200;i++){
    for(let j=0;j<200;j++){
        let color = Math.floor(heat_data[i*201+j]/100*255);
        colors[(i*200+j)*6*3] = color;
        colors[(i*200+j)*6*3+1] = 0;
        colors[(i*200+j)*6*3+2] = 255-color;

        colors[(i*200+j)*6*3+3] = color;
        colors[(i*200+j)*6*3+4] = 0;
        colors[(i*200+j)*6*3+5] = 255-color;

        colors[(i*200+j)*6*3+6] = color;
        colors[(i*200+j)*6*3+7] = 0;
        colors[(i*200+j)*6*3+8] = 255-color;

        colors[(i*200+j)*6*3+9] = color;
        colors[(i*200+j)*6*3+10] = 0;
        colors[(i*200+j)*6*3+11] = 255-color;

        colors[(i*200+j)*6*3+12] = color;
        colors[(i*200+j)*6*3+13] = 0;
        colors[(i*200+j)*6*3+14] = 255-color;

        colors[(i*200+j)*6*3+15] = color;
        colors[(i*200+j)*6*3+16] = 0;
        colors[(i*200+j)*6*3+17] = 255-color;
    }
}



/**
 * Data is triangle , 2 triangles per square, 6 vertices per square, 3 coordinates per vertex
 * at a 20x20 grid
 */
var data = new Float32Array(200*200*6*3);

var step = 1;

for(let i=0;i<200;i++){
    for(let j=0;j<200;j++){
        data[(i*200+j)*6*3] = i*step;
        data[(i*200+j)*6*3+1] = j*step;
        data[(i*200+j)*6*3+2] = heat_data[i*201+j];

        data[(i*200+j)*6*3+3] = (i+1)*step;
        data[(i*200+j)*6*3+4] = j*step;
        data[(i*200+j)*6*3+5] = heat_data[(i+1)*201+j];

        data[(i*200+j)*6*3+6] = i*step;
        data[(i*200+j)*6*3+7] = (j+1)*step;
        data[(i*200+j)*6*3+8] = heat_data[i*201+j+1];

        data[(i*200+j)*6*3+9] = (i+1)*step;
        data[(i*200+j)*6*3+10] = j*step;
        data[(i*200+j)*6*3+11] = heat_data[(i+1)*201+j];

        data[(i*200+j)*6*3+12] = (i+1)*step;
        data[(i*200+j)*6*3+13] = (j+1)*step;
        data[(i*200+j)*6*3+14] = heat_data[(i+1)*201+j+1];

        data[(i*200+j)*6*3+15] = i*step;
        data[(i*200+j)*6*3+16] = (j+1)*step;
        data[(i*200+j)*6*3+17] = heat_data[i*201+j+1];
    }
}


var main_plot;

$(document).ready(function () {
    main_plot = new webgl_contour_plot2('canvas1',data,colors);
    main_plot.drawScene();

    /**
     * Add event listener for range sliders rotation_x, rotation_y, rotation_z
     */
    document.getElementById('rotation_x').addEventListener('input', function () {
        main_plot.rotation_x = this.value;
        main_plot.drawScene();
    });

    document.getElementById('rotation_y').addEventListener('input', function () {
        main_plot.rotation_y = this.value;
        main_plot.drawScene();
    });

    document.getElementById('rotation_z').addEventListener('input', function () {
        main_plot.rotation_z = this.value;
        main_plot.drawScene();
    });
});

