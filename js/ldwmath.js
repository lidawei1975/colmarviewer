
class ldwmath {
    constructor() {
        this.PI = 3.14159265359;
    };


    /**
     * This function calculate the intersects between a ray with a line segment in 2D or 3D space.
     * @param {*} rayOrigin array of 2 values
     * @param {*} rayDirection  array of 2  values [0,1] or [1.0]
     * @param {*} lineStart  array of 2  values
     * @param {*} lineEnd  array of 2 values
     * @returns null if no intersection, else the intersection point
     */
    rayIntersectsLine(rayOrigin, rayDirection, lineStart, lineEnd)
    {

        // Calculate the direction vector of the line
        const lineDirection = [
          lineEnd[0] - lineStart[0],
          lineEnd[1] - lineStart[1]
    ];
      
        // Calculate the denominator for the intersection equations
        const denominator = rayDirection[0] * lineDirection[1] - rayDirection[1] * lineDirection[0];
      
        // If the denominator is 0, the ray and line are parallel (or coincident)
        if (denominator === 0) {
          return null;
        }
      
        // Calculate the t and u parameters for the intersection equations
        const t = ((lineStart[0] - rayOrigin[0]) * lineDirection[1] - (lineStart[1] - rayOrigin[1]) * lineDirection[0]) / denominator;
        const u = ((lineStart[0] - rayOrigin[0]) * rayDirection[1] - (lineStart[1] - rayOrigin[1]) * rayDirection[0]) / denominator;
      
        // Check if the intersection point lies on both the ray and the line segment
        if (t >= 0 && u >= 0 && u <= 1) {
          // Calculate the intersection point
          const intersectionPoint = [
            rayOrigin[0] + t * rayDirection[0],
            rayOrigin[1] + t * rayDirection[1]
        ];
          return intersectionPoint;
        }
      
        // No intersection
        return null;
      }

    /**
     * This function calculate the left,right,top and bottom edges of a polygon and center point (mean of all points)
     * @param {*} polygon array of 2D points
     */
    edgeAndCenter(polygon) {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let sumX = 0;
        let sumY = 0;
        for (let i = 0; i < polygon.length; i++) {
            if (polygon[i][0] < minX) {
                minX = polygon[i][0];
            }
            if (polygon[i][0] > maxX) {
                maxX = polygon[i][0];
            }
            if (polygon[i][1] < minY) {
                minY = polygon[i][1];
            }
            if (polygon[i][1] > maxY) {
                maxY = polygon[i][1];
            }
            sumX += polygon[i][0];
            sumY += polygon[i][1];
        }
        return {
            left: minX,
            right: maxX,
            top: maxY,
            bottom: minY,
            center_x: sumX / polygon.length,
            center_y: sumY / polygon.length
        };
    }
}