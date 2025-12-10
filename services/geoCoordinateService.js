// services/geoCoordinateService.js  ← REPLACE ENTIRE FILE

const proj4 = require('proj4');
const turf = require('@turf/turf');
const { GeoCoordinate, LandRecord } = require('../models');

proj4.defs('EPSG:20137', '+proj=utm +zone=37 +ellps=clrk66 +towgs84=-166,-15,204,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const createCoordinates = async ({ land_record_id, points }, transaction) => {
  // Validation
  if (!land_record_id || isNaN(land_record_id)) {
    throw new AppError('Valid land_record_id is required', 400);
  }
  if (!Array.isArray(points) || points.length < 3) {
    throw new AppError('At least 3 coordinate points are required', 400);
  }

  // Check land record exists
  const landRecord = await LandRecord.findByPk(land_record_id, { transaction });
  if (!landRecord) throw new AppError('Land record not found', 404);

  // Delete old coordinates
  await GeoCoordinate.destroy({ where: { land_record_id }, transaction });

  // Convert X/Y → Lat/Long + prepare for DB
  const coordinates = points.map((pt, i) => {
    const easting = parseFloat(pt.easting);
    const northing = parseFloat(pt.northing);

    if (isNaN(easting) || isNaN(northing)) {
      throw new AppError(`Point ${i + 1}: Invalid easting/northing values`, 400);
    }

    const [longitude, latitude] = proj4('EPSG:20137', 'EPSG:4326', [easting, northing]);

    return {
      land_record_id,
      easting,
      northing,
      latitude: Number(latitude.toFixed(8)),
      longitude: Number(longitude.toFixed(8)),
      sequence: i,
      label: pt.label?.toString().trim() || `${i + 1}`,
      description: pt.description || null,
    };
  });

  // Save to database
  const created = await GeoCoordinate.bulkCreate(coordinates, { transaction });

  // CORRECT AREA & PERIMETER USING PROJECTED COORDINATES (meters)
  const shoelaceArea = () => {
    let area = 0;
    const n = created.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += created[i].easting * created[j].northing;
      area -= created[j].easting * created[i].northing;
    }

    return Math.abs(area) / 2.0;
  };

  const calculatePerimeter = () => {
    let perimeter = 0;
    const n = created.length;

    for (let i = 0; i < n; i++) {
      const current = created[i];
      const next = created[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      perimeter += Math.hypot(dx, dy); 
    }

    return perimeter;
  };

  // NEW: Calculate dimension lengths (distances between each point)
  const calculateDimensionLengths = () => {
    const dimensionLengths = [];
    const n = created.length;
    
    for (let i = 0; i < n; i++) {
      const current = created[i];
      const next = created[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      const distance = Math.hypot(dx, dy);
      
      dimensionLengths.push({
        from_point: current.label || `P${current.sequence + 1}`,
        to_point: next.label || `P${next.sequence + 1}`,
        from_sequence: current.sequence,
        to_sequence: next.sequence,
        length_m: Number(distance.toFixed(2)),
        dx_m: Number(dx.toFixed(2)), 
        dy_m: Number(dy.toFixed(2)), 
        bearing: calculateBearing(current.easting, current.northing, next.easting, next.northing),
        is_closing_line: i === n - 1  // Last segment closes the polygon
      });
    }
    
    return dimensionLengths;
  };

  // Helper function to calculate bearing (azimuth) between two UTM points
  const calculateBearing = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Calculate bearing in radians
    let bearing = Math.atan2(dx, dy);
    
    // Convert to degrees (0° to 360°)
    let bearingDegrees = bearing * (180 / Math.PI);
    
    // Normalize to 0-360
    if (bearingDegrees < 0) {
      bearingDegrees += 360;
    }
    
    // Convert to cardinal directions
    const cardinalDirections = [
      "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N"
    ];
    
    const index = Math.round(bearingDegrees / 22.5) % 16;
    const direction = cardinalDirections[index];
    
    return {
      degrees: Number(bearingDegrees.toFixed(1)),
      direction: direction,
      radians: Number(bearing.toFixed(4))
    };
  };

  // NEW: Calculate all side lengths statistics
  const calculateSideStatistics = (dimensionLengths) => {
    const lengths = dimensionLengths.map(d => d.length_m);
    const sum = lengths.reduce((a, b) => a + b, 0);
    const avg = sum / lengths.length;
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    
    // Standard deviation
    const squareDiffs = lengths.map(length => Math.pow(length - avg, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    
    // Find longest and shortest sides
    const longestSide = dimensionLengths.find(d => d.length_m === max);
    const shortestSide = dimensionLengths.find(d => d.length_m === min);
    
    return {
      total_sides: lengths.length,
      total_length_m: Number(sum.toFixed(2)),
      average_length_m: Number(avg.toFixed(2)),
      min_length_m: Number(min.toFixed(2)),
      max_length_m: Number(max.toFixed(2)),
      std_dev_m: Number(stdDev.toFixed(2)),
      longest_side: {
        from: longestSide.from_point,
        to: longestSide.to_point,
        length_m: longestSide.length_m
      },
      shortest_side: {
        from: shortestSide.from_point,
        to: shortestSide.to_point,
        length_m: shortestSide.length_m
      },
      length_variance_m2: Number(variance.toFixed(2))
    };
  };

  // NEW: Calculate polygon shape classification
  const classifyPolygonShape = (dimensionLengths, area) => {
    const n = dimensionLengths.length;
    const sideLengths = dimensionLengths.map(d => d.length_m);
    
    // Check if all sides are equal
    const tolerance = 0.1; // 10 cm tolerance for equality
    const allSidesEqual = sideLengths.every(length => 
      Math.abs(length - sideLengths[0]) < tolerance
    );
    
    // Calculate interior angles (approximate using UTM coordinates)
    const calculateAngles = () => {
      const angles = [];
      for (let i = 0; i < n; i++) {
        const prev = created[(i - 1 + n) % n];
        const current = created[i];
        const next = created[(i + 1) % n];
        
        // Vectors
        const v1 = {
          x: prev.easting - current.easting,
          y: prev.northing - current.northing
        };
        const v2 = {
          x: next.easting - current.easting,
          y: next.northing - current.northing
        };
        
        // Dot product and magnitudes
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);
        
        // Angle in radians, then degrees
        const angleRad = Math.acos(dot / (mag1 * mag2));
        const angleDeg = angleRad * (180 / Math.PI);
        
        angles.push(Number(angleDeg.toFixed(1)));
      }
      return angles;
    };
    
    const interiorAngles = calculateAngles();
    const sumAngles = interiorAngles.reduce((a, b) => a + b, 0);
    const expectedSum = (n - 2) * 180;
    
    // Shape classification
    let shape = "Irregular Polygon";
    
    if (n === 3) {
      const [a, b, c] = sideLengths;
      if (Math.abs(a - b) < tolerance && Math.abs(b - c) < tolerance) {
        shape = "Equilateral Triangle";
      } else if (Math.abs(a - b) < tolerance || Math.abs(b - c) < tolerance || Math.abs(c - a) < tolerance) {
        shape = "Isosceles Triangle";
      } else {
        shape = "Scalene Triangle";
      }
    } else if (n === 4) {
      const [a, b, c, d] = sideLengths;
      const oppositeEqual = Math.abs(a - c) < tolerance && Math.abs(b - d) < tolerance;
      const allEqual = Math.abs(a - b) < tolerance && Math.abs(b - c) < tolerance && Math.abs(c - d) < tolerance;
      
      if (allEqual) {
        // Check if angles are 90°
        const rightAngles = interiorAngles.every(angle => Math.abs(angle - 90) < 1);
        shape = rightAngles ? "Square" : "Rhombus";
      } else if (oppositeEqual) {
        // Check if angles are 90°
        const rightAngles = interiorAngles.every(angle => Math.abs(angle - 90) < 1);
        shape = rightAngles ? "Rectangle" : "Parallelogram";
      } else {
        shape = "Quadrilateral";
      }
    } else if (n > 4) {
      if (allSidesEqual) {
        shape = "Regular Polygon";
      } else {
        shape = `${n}-sided Polygon`;
      }
    }
    
    return {
      shape,
      num_sides: n,
      interior_angles: interiorAngles,
      angle_sum: {
        actual: Number(sumAngles.toFixed(1)),
        expected: expectedSum,
        deviation: Number((sumAngles - expectedSum).toFixed(1))
      },
      side_equality: allSidesEqual ? "All sides equal" : "Sides vary",
      is_convex: n <= 3 ? true : isPolygonConvex(created) // Need to implement convex check
    };
  };

  // Helper function to check if polygon is convex
  const isPolygonConvex = (points) => {
    if (points.length < 4) return true; // Triangles are always convex
    
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];
      
      // Cross product
      const cross = (p2.easting - p1.easting) * (p3.northing - p2.northing) -
                   (p2.northing - p1.northing) * (p3.easting - p2.easting);
      
      if (cross !== 0) {
        if (sign === 0) {
          sign = cross > 0 ? 1 : -1;
        } else if (sign * cross < 0) {
          return false; // Concave
        }
      }
    }
    return true;
  };

  const area = shoelaceArea();
  const perimeter = calculatePerimeter();
  const dimensionLengths = calculateDimensionLengths();
  const sideStatistics = calculateSideStatistics(dimensionLengths);
  const shapeClassification = classifyPolygonShape(dimensionLengths, area);

  // Center (average of lat/long)
  const center = {
    latitude: Number((created.reduce((sum, c) => sum + c.latitude, 0) / created.length).toFixed(8)),
    longitude: Number((created.reduce((sum, c) => sum + c.longitude, 0) / created.length).toFixed(8)),
  };

  return {
    coordinates: created,
    polygon: created.map(c => [c.latitude, c.longitude]), 
    center,
    area_m2: Number(area.toFixed(2)),
    perimeter_m: Number(perimeter.toFixed(2)),
    // NEW: Dimension data
    dimensions: {
      lengths: dimensionLengths,
      statistics: sideStatistics,
      shape: shapeClassification,
      bounding_box: calculateBoundingBox(created),
      area_to_perimeter_ratio: Number((area / perimeter).toFixed(4)),
      compactness: calculateCompactness(area, perimeter)
    }
  };
};

// Additional helper functions (add these outside the main function if you prefer)
const calculateBoundingBox = (coordinates) => {
  const eastings = coordinates.map(c => c.easting);
  const northings = coordinates.map(c => c.northing);
  
  const minEasting = Math.min(...eastings);
  const maxEasting = Math.max(...eastings);
  const minNorthing = Math.min(...northings);
  const maxNorthing = Math.max(...northings);
  
  const width = maxEasting - minEasting;
  const height = maxNorthing - minNorthing;
  
  // Convert corners to lat/long
  const sw = proj4('EPSG:20137', 'EPSG:4326', [minEasting, minNorthing]);
  const ne = proj4('EPSG:20137', 'EPSG:4326', [maxEasting, maxNorthing]);
  
  return {
    min_easting: Number(minEasting.toFixed(2)),
    max_easting: Number(maxEasting.toFixed(2)),
    min_northing: Number(minNorthing.toFixed(2)),
    max_northing: Number(maxNorthing.toFixed(2)),
    width_m: Number(width.toFixed(2)),
    height_m: Number(height.toFixed(2)),
    area_m2: Number((width * height).toFixed(2)),
    aspect_ratio: Number((width / height).toFixed(3)),
    southwest: { latitude: Number(sw[1].toFixed(8)), longitude: Number(sw[0].toFixed(8)) },
    northeast: { latitude: Number(ne[1].toFixed(8)), longitude: Number(ne[0].toFixed(8)) }
  };
};

const calculateCompactness = (area, perimeter) => {
  // Compactness ratio (4πA/P²) - 1 for a perfect circle, less for other shapes
  if (perimeter === 0) return 0;
  const compactness = (4 * Math.PI * area) / Math.pow(perimeter, 2);
  return Number(compactness.toFixed(4));
};

const getCoordinatesByLandRecord = async (land_record_id) => {

  if (!land_record_id || isNaN(land_record_id)) {
    throw new AppError('Valid land_record_id is required', 400);
  }

  const coordinates = await GeoCoordinate.findAll({
    where: { land_record_id },
    order: [['sequence', 'ASC']],
    attributes: [
      'id', 'easting', 'northing', 'latitude', 'longitude',
      'sequence', 'label', 'description', 'createdAt'
    ],
  });

  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  // CORRECT AREA USING SHOELACE FORMULA (in meters)
  const shoelaceArea = () => {
    let area = 0;
    const n = coordinates.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += coordinates[i].easting * coordinates[j].northing;
      area -= coordinates[j].easting * coordinates[i].northing;
    }

    return Math.abs(area) / 2.0;
  };

  // CORRECT PERIMETER USING EUCLIDEAN DISTANCE (in meters)
  const calculatePerimeter = () => {
    let perimeter = 0;
    const n = coordinates.length;

    for (let i = 0; i < n; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      perimeter += Math.hypot(dx, dy);
    }

    return perimeter;
  };

  // NEW: Calculate dimension lengths (distances between each point)
  const calculateDimensionLengths = () => {
    const dimensionLengths = [];
    const n = coordinates.length;
    
    for (let i = 0; i < n; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      const distance = Math.hypot(dx, dy);
      
      dimensionLengths.push({
        from_point: current.label || `P${current.sequence + 1}`,
        to_point: next.label || `P${next.sequence + 1}`,
        from_sequence: current.sequence,
        to_sequence: next.sequence,
        length_m: Number(distance.toFixed(2)),
        dx_m: Number(dx.toFixed(2)),  // East-West difference
        dy_m: Number(dy.toFixed(2)),  // North-South difference
        bearing: calculateBearing(current.easting, current.northing, next.easting, next.northing),
        is_closing_line: i === n - 1  // Last segment closes the polygon
      });
    }
    
    return dimensionLengths;
  };

  // Helper function to calculate bearing (azimuth) between two UTM points
  const calculateBearing = (x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Calculate bearing in radians
    let bearing = Math.atan2(dx, dy);
    
    // Convert to degrees (0° to 360°)
    let bearingDegrees = bearing * (180 / Math.PI);
    
    // Normalize to 0-360
    if (bearingDegrees < 0) {
      bearingDegrees += 360;
    }
    
    // Convert to cardinal directions
    const cardinalDirections = [
      "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N"
    ];
    
    const index = Math.round(bearingDegrees / 22.5) % 16;
    const direction = cardinalDirections[index];
    
    return {
      degrees: Number(bearingDegrees.toFixed(1)),
      direction: direction,
      radians: Number(bearing.toFixed(4))
    };
  };

  // NEW: Calculate all side lengths statistics
  const calculateSideStatistics = (dimensionLengths) => {
    const lengths = dimensionLengths.map(d => d.length_m);
    const sum = lengths.reduce((a, b) => a + b, 0);
    const avg = sum / lengths.length;
    const min = Math.min(...lengths);
    const max = Math.max(...lengths);
    
    // Standard deviation
    const squareDiffs = lengths.map(length => Math.pow(length - avg, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    
    // Find longest and shortest sides
    const longestSide = dimensionLengths.find(d => d.length_m === max);
    const shortestSide = dimensionLengths.find(d => d.length_m === min);
    
    return {
      total_sides: lengths.length,
      total_length_m: Number(sum.toFixed(2)),
      average_length_m: Number(avg.toFixed(2)),
      min_length_m: Number(min.toFixed(2)),
      max_length_m: Number(max.toFixed(2)),
      std_dev_m: Number(stdDev.toFixed(2)),
      longest_side: {
        from: longestSide.from_point,
        to: longestSide.to_point,
        length_m: longestSide.length_m
      },
      shortest_side: {
        from: shortestSide.from_point,
        to: shortestSide.to_point,
        length_m: shortestSide.length_m
      },
      length_variance_m2: Number(variance.toFixed(2))
    };
  };

  // NEW: Calculate polygon shape classification
  const classifyPolygonShape = (dimensionLengths, area) => {
    const n = dimensionLengths.length;
    const sideLengths = dimensionLengths.map(d => d.length_m);
    
    // Check if all sides are equal
    const tolerance = 0.1; // 10 cm tolerance for equality
    const allSidesEqual = sideLengths.every(length => 
      Math.abs(length - sideLengths[0]) < tolerance
    );
    
    // Calculate interior angles (approximate using UTM coordinates)
    const calculateAngles = () => {
      const angles = [];
      for (let i = 0; i < n; i++) {
        const prev = coordinates[(i - 1 + n) % n];
        const current = coordinates[i];
        const next = coordinates[(i + 1) % n];
        
        // Vectors
        const v1 = {
          x: prev.easting - current.easting,
          y: prev.northing - current.northing
        };
        const v2 = {
          x: next.easting - current.easting,
          y: next.northing - current.northing
        };
        
        // Dot product and magnitudes
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);
        
        // Angle in radians, then degrees
        const angleRad = Math.acos(dot / (mag1 * mag2));
        const angleDeg = angleRad * (180 / Math.PI);
        
        angles.push(Number(angleDeg.toFixed(1)));
      }
      return angles;
    };
    
    const interiorAngles = calculateAngles();
    const sumAngles = interiorAngles.reduce((a, b) => a + b, 0);
    const expectedSum = (n - 2) * 180;
    
    // Shape classification
    let shape = "Irregular Polygon";
    
    if (n === 3) {
      const [a, b, c] = sideLengths;
      if (Math.abs(a - b) < tolerance && Math.abs(b - c) < tolerance) {
        shape = "Equilateral Triangle";
      } else if (Math.abs(a - b) < tolerance || Math.abs(b - c) < tolerance || Math.abs(c - a) < tolerance) {
        shape = "Isosceles Triangle";
      } else {
        shape = "Scalene Triangle";
      }
    } else if (n === 4) {
      const [a, b, c, d] = sideLengths;
      const oppositeEqual = Math.abs(a - c) < tolerance && Math.abs(b - d) < tolerance;
      const allEqual = Math.abs(a - b) < tolerance && Math.abs(b - c) < tolerance && Math.abs(c - d) < tolerance;
      
      if (allEqual) {
        // Check if angles are 90°
        const rightAngles = interiorAngles.every(angle => Math.abs(angle - 90) < 1);
        shape = rightAngles ? "Square" : "Rhombus";
      } else if (oppositeEqual) {
        // Check if angles are 90°
        const rightAngles = interiorAngles.every(angle => Math.abs(angle - 90) < 1);
        shape = rightAngles ? "Rectangle" : "Parallelogram";
      } else {
        shape = "Quadrilateral";
      }
    } else if (n > 4) {
      if (allSidesEqual) {
        shape = "Regular Polygon";
      } else {
        shape = `${n}-sided Polygon`;
      }
    }
    
    return {
      shape,
      num_sides: n,
      interior_angles: interiorAngles,
      angle_sum: {
        actual: Number(sumAngles.toFixed(1)),
        expected: expectedSum,
        deviation: Number((sumAngles - expectedSum).toFixed(1))
      },
      side_equality: allSidesEqual ? "All sides equal" : "Sides vary",
      is_convex: n <= 3 ? true : isPolygonConvex(coordinates)
    };
  };

  // Helper function to check if polygon is convex
  const isPolygonConvex = (points) => {
    if (points.length < 4) return true; // Triangles are always convex
    
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];
      
      // Cross product
      const cross = (p2.easting - p1.easting) * (p3.northing - p2.northing) -
                   (p2.northing - p1.northing) * (p3.easting - p2.easting);
      
      if (cross !== 0) {
        if (sign === 0) {
          sign = cross > 0 ? 1 : -1;
        } else if (sign * cross < 0) {
          return false; // Concave
        }
      }
    }
    return true;
  };

  // NEW: Calculate bounding box
  const calculateBoundingBox = () => {
    const eastings = coordinates.map(c => c.easting);
    const northings = coordinates.map(c => c.northing);
    
    const minEasting = Math.min(...eastings);
    const maxEasting = Math.max(...eastings);
    const minNorthing = Math.min(...northings);
    const maxNorthing = Math.max(...northings);
    
    const width = maxEasting - minEasting;
    const height = maxNorthing - minNorthing;
    
    // Convert corners to lat/long
    const sw = proj4('EPSG:20137', 'EPSG:4326', [minEasting, minNorthing]);
    const ne = proj4('EPSG:20137', 'EPSG:4326', [maxEasting, maxNorthing]);
    
    return {
      min_easting: Number(minEasting.toFixed(2)),
      max_easting: Number(maxEasting.toFixed(2)),
      min_northing: Number(minNorthing.toFixed(2)),
      max_northing: Number(maxNorthing.toFixed(2)),
      width_m: Number(width.toFixed(2)),
      height_m: Number(height.toFixed(2)),
      area_m2: Number((width * height).toFixed(2)),
      aspect_ratio: Number((width / height).toFixed(3)),
      southwest: { latitude: Number(sw[1].toFixed(8)), longitude: Number(sw[0].toFixed(8)) },
      northeast: { latitude: Number(ne[1].toFixed(8)), longitude: Number(ne[0].toFixed(8)) }
    };
  };

  // NEW: Calculate compactness
  const calculateCompactness = (area, perimeter) => {
    // Compactness ratio (4πA/P²) - 1 for a perfect circle, less for other shapes
    if (perimeter === 0) return 0;
    const compactness = (4 * Math.PI * area) / Math.pow(perimeter, 2);
    return Number(compactness.toFixed(4));
  };

  const area = shoelaceArea();
  const perimeter = calculatePerimeter();
  const dimensionLengths = calculateDimensionLengths();
  const sideStatistics = calculateSideStatistics(dimensionLengths);
  const shapeClassification = classifyPolygonShape(dimensionLengths, area);
  const boundingBox = calculateBoundingBox();
  const compactness = calculateCompactness(area, perimeter);

  // Center point (average of lat/long for Leaflet)
  const center = {
    latitude: Number((coordinates.reduce((sum, c) => sum + c.latitude, 0) / coordinates.length).toFixed(8)),
    longitude: Number((coordinates.reduce((sum, c) => sum + c.longitude, 0) / coordinates.length).toFixed(8)),
  };

  return {
    coordinates,
    polygon: coordinates.map(c => [c.latitude, c.longitude]),
    center,
    area_m2: Number(area.toFixed(2)),
    perimeter_m: Number(perimeter.toFixed(2)),
    // NEW: Dimension data
    dimensions: {
      lengths: dimensionLengths,
      statistics: sideStatistics,
      shape: shapeClassification,
      bounding_box: boundingBox,
      area_to_perimeter_ratio: Number((area / perimeter).toFixed(4)),
      compactness: compactness,
      // Additional metrics
      area_hectares: Number((area / 10000).toFixed(4)),
      perimeter_km: Number((perimeter / 1000).toFixed(3)),
      // Coordinate statistics
      coordinate_count: coordinates.length,
      has_labels: coordinates.some(c => c.label && c.label !== `${c.sequence + 1}`),
      has_descriptions: coordinates.some(c => c.description)
    }
  };
};

const updateCoordinatesService = async (
  recordId,
  existingCoordinates,
  newCoordinates,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // If no new coordinates provided, do nothing
    if (!newCoordinates || newCoordinates.length === 0) {
      return { message: "No coordinates to update" };
    }

    // Track if coordinates were actually updated
    let coordinatesUpdated = false;

    // If we have existing coordinates, update them
    if (existingCoordinates && existingCoordinates.length > 0) {
      // Update each existing coordinate with new easting/northing
      for (let i = 0; i < existingCoordinates.length && i < newCoordinates.length; i++) {
        const existingCoord = existingCoordinates[i];
        const newCoord = newCoordinates[i];
        
        // Only update if we have easting and northing in new data
        if (newCoord.easting !== undefined && newCoord.northing !== undefined) {
          // Check if values are actually different
          if (existingCoord.easting !== newCoord.easting || existingCoord.northing !== newCoord.northing) {
            coordinatesUpdated = true;
            
            await GeoCoordinate.update(
              {
                easting: newCoord.easting,
                northing: newCoord.northing,
                updated_by: updater.id,
                updated_at: new Date()
              },
              {
                where: { 
                  id: existingCoord.id,
                  land_record_id: recordId 
                },
                transaction: t,
                individualHooks: true
              }
            );
          }
        }
      }
      
      // If we have more new coordinates than existing, create the extra ones
      if (newCoordinates.length > existingCoordinates.length) {
        coordinatesUpdated = true;
        const coordinatesToCreate = [];
        
        for (let i = existingCoordinates.length; i < newCoordinates.length; i++) {
          const newCoord = newCoordinates[i];
          
          if (newCoord.easting !== undefined && newCoord.northing !== undefined) {
            coordinatesToCreate.push({
              easting: newCoord.easting,
              northing: newCoord.northing,
              land_record_id: recordId,
              sequence: i,
              created_by: updater.id,
              updated_by: updater.id
            });
          }
        }
        
        if (coordinatesToCreate.length > 0) {
          await GeoCoordinate.bulkCreate(coordinatesToCreate, {
            transaction: t,
            individualHooks: true
          });
        }
      }
    } else {
      // No existing coordinates, create new ones
      coordinatesUpdated = true;
      const coordinatesToCreate = newCoordinates
        .filter(coord => coord.easting !== undefined && coord.northing !== undefined)
        .map((coord, index) => ({
          easting: coord.easting,
          northing: coord.northing,
          land_record_id: recordId,
          sequence: index,
          created_by: updater.id,
          updated_by: updater.id
        }));
      
      if (coordinatesToCreate.length > 0) {
        await GeoCoordinate.bulkCreate(coordinatesToCreate, {
          transaction: t,
          individualHooks: true
        });
      }
    }

    // If coordinates were updated, recalculate and update area_m2 in LandRecord
    if (coordinatesUpdated) {
      // Get all coordinates for this land record (including newly created/updated ones)
      const allCoordinates = await GeoCoordinate.findAll({
        where: { land_record_id: recordId },
        order: [['sequence', 'ASC']],
        transaction: t
      });

      if (allCoordinates.length >= 3) {
        // Calculate area using shoelace formula (in square meters)
        const area = calculatePolygonArea(allCoordinates);
        
        // Update the LandRecord with new area
        await LandRecord.update(
          {
            area_m2: area,
            updated_by: updater.id,
            updated_at: new Date()
          },
          {
            where: { id: recordId },
            transaction: t
          }
        );
        
        console.log(`Updated area_m2 for land record ${recordId}: ${area} m²`);
      }
    }

    if (!transaction) await t.commit();

    return { 
      message: "Coordinates updated successfully",
      updatedCount: Math.min(existingCoordinates?.length || 0, newCoordinates.length),
      areaUpdated: coordinatesUpdated
    };

  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error('Coordinates update error:', error);
    throw new Error(`Coordinates update failed: ${error.message}`);
  }
};

// Helper function to calculate polygon area using shoelace formula
const calculatePolygonArea = (coordinates) => {
  if (coordinates.length < 3) {
    return 0;
  }

  let area = 0;
  const n = coordinates.length;

  // Shoelace formula for UTM coordinates (in meters)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i].easting * coordinates[j].northing;
    area -= coordinates[j].easting * coordinates[i].northing;
  }

  // Area in square meters (absolute value divided by 2)
  const areaM2 = Math.abs(area) / 2.0;
  
  return Number(areaM2.toFixed(2));
};

// Alternative: Calculate area and perimeter (if you need both)
const calculatePolygonMetrics = (coordinates) => {
  if (coordinates.length < 3) {
    return { area: 0, perimeter: 0 };
  }

  let area = 0;
  let perimeter = 0;
  const n = coordinates.length;

  for (let i = 0; i < n; i++) {
    const current = coordinates[i];
    const next = coordinates[(i + 1) % n];
    
    // Area calculation (shoelace)
    area += current.easting * next.northing;
    area -= next.easting * current.northing;
    
    // Perimeter calculation
    const dx = next.easting - current.easting;
    const dy = next.northing - current.northing;
    perimeter += Math.hypot(dx, dy);
  }

  return {
    area: Number((Math.abs(area) / 2.0).toFixed(2)),
    perimeter: Number(perimeter.toFixed(2))
  };
};

// Updated version with full metrics calculation
const updateCoordinatesServiceWithMetrics = async (
  recordId,
  existingCoordinates,
  newCoordinates,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // ... [same update logic as above] ...

    // If coordinates were updated, recalculate all metrics
    if (coordinatesUpdated) {
      const allCoordinates = await GeoCoordinate.findAll({
        where: { land_record_id: recordId },
        order: [['sequence', 'ASC']],
        transaction: t
      });

      if (allCoordinates.length >= 3) {
        // Calculate area and perimeter
        const metrics = calculatePolygonMetrics(allCoordinates);
        
        // Calculate center point (average of coordinates)
        const totalEast = allCoordinates.reduce((sum, coord) => sum + coord.easting, 0);
        const totalNorth = allCoordinates.reduce((sum, coord) => sum + coord.northing, 0);
        const centerEasting = totalEast / allCoordinates.length;
        const centerNorthing = totalNorth / allCoordinates.length;
        
        // Convert center to lat/long
        const [centerLongitude, centerLatitude] = proj4('EPSG:20137', 'EPSG:4326', [centerEasting, centerNorthing]);

        // Update the LandRecord with all metrics
        await LandRecord.update(
          {
            area_m2: metrics.area,
            perimeter_m: metrics.perimeter,
            center_latitude: Number(centerLatitude.toFixed(8)),
            center_longitude: Number(centerLongitude.toFixed(8)),
            total_points: allCoordinates.length,
            updated_by: updater.id,
            updated_at: new Date(),
            last_coordinate_update: new Date()
          },
          {
            where: { id: recordId },
            transaction: t
          }
        );
        
        console.log(`Updated land record ${recordId} metrics: ${metrics.area} m², ${metrics.perimeter} m`);
      }
    }

    if (!transaction) await t.commit();

    return { 
      message: "Coordinates updated successfully",
      updatedCount: Math.min(existingCoordinates?.length || 0, newCoordinates.length),
      metricsUpdated: coordinatesUpdated
    };

  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error('Coordinates update error:', error);
    throw new Error(`Coordinates update failed: ${error.message}`);
  }
};


module.exports = { createCoordinates, getCoordinatesByLandRecord,updateCoordinatesService };