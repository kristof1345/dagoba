var Dagoba = {}; // the namespace

Dagoba.G = {}; // the prototype

Dagoba.graph = function (V, E) {
  // the factory
  var graph = Object.create(Dagoba.G);

  graph.edges = []; // fresh copies so they are not shared
  graph.vertices = [];
  graph.vertexIndex = {}; // a lookup optimization

  graph.autoid = 1;

  if (Array.isArray(V)) graph.addVertices(V); // arrays only, because you wouldn't
  if (Array.isArray(E)) graph.addEdges(E); //   call this with singular V and E

  return graph;
};

Dagoba.G.addVertices = function (vs) {
  vs.forEach(this.addVertex.bind(this));
};

Dagoba.G.addEdges = function (es) {
  es.forEach(this.addEdge.bind(this));
};

Dagoba.G.addVertex = function (vertex) {
  // accepts a vertex like object
  if (!vertex._id) {
    vertex._id = this.autoid++;
  } else if (this.findVertexById(vertex._id)) {
    return Dagoba.error("A vertex with that ID already exists");
  }

  this.vertices.push(vertex);
  this.vertexIndex[vertex._id] = vertex; // fancy index thing
  vertex._out = [];
  vertex._in = []; // placeholders for edge pointers
  return vertex._id;
};

Dagoba.G.addEdge = function (edge) {
  // accepts an edge-like object
  edge._in = this.findVertexById(edge._in);
  edge._out = this.findVertexById(edge._out);

  if (!(edge._in && edge._out)) {
    return Dagoba.error(
      `That edge's ${edge._in ? "out" : "in"} vertex wasn't found`
    );
  }

  edge._out._out.push(edge); // edge's out vertex's out edges
  edge._in._in.push(edge); // vice versa

  this.edges.push(edge);
};

Dagoba.error = function (msg) {
  console.log(msg);
  return false;
};

/!* QUERY */;
Dagoba.Q = {};

Dagoba.query = function (graph) {
  // factory
  var query = Object.create(Dagoba.Q);

  query.graph = graph; // graph itself
  query.state = []; // state for each step
  query.program = []; // list of steps to take
  query.gremlins = []; // gremlins for each step

  return query;
};
