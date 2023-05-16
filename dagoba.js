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

  console.log(graph);
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

Dagoba.Q.add = function (pipetype, args) {
  // add new step to the query
  var step = [pipetype, args];
  this.program.push(step); // step is a pair of pipetype and its args
  return this;
};

Dagoba.G.v = function () {
  // query initializer: g.v() -> query
  var query = Dagoba.query(this);
  query.add("vertex", [].slice.call(arguments)); // add a step to our program
  return query;
};

/!* PIPETYPES */;
Dagoba.Pipetypes = {};

Dagoba.addPipetype = function (name, fun) {
  Dagoba.Pipetypes[name] = fun;
  Dagoba.Q[name] = function () {
    return this.add(name, [].slice.apply(arguments));
  };
};

Dagoba.getPipetype = function (name) {
  var pipetype = Dagoba.Pipetypes[name]; // a pipetype is a function
  if (!pipetype) {
    Dagoba.error("Unrecognized pipetype: " + name);
  }
  return pipetype || Dagoba.fauxPipetype;
};

Dagoba.fauxPipetype = function (_, _, maybe_gremlin) {
  // pass the result upstream
  return maybe_gremlin || "pull"; // or send a pull downstream
};

//BUILT IN PIPETYPES

Dagoba.addPipetype("vertex", function (graph, args, gremlin, state) {
  if (!state.vertices) {
    state.vertices = graph.findVertices(args); // init state
  }

  if (!state.vertices.length) {
    // all done
    return "done";
  }

  var vertex = state.vertices.pop(); // OPT: requires vertex cloning
  return Dagoba.makeGremlin(vertex, gremlin.state); // gremlins from as/back queries
});

Dagoba.simpleTraversal = function (dir) {
  var find_method = dir == "out" ? "findOutEdges" : "findInEdges";
  var edge_list = dir == "out" ? "_in" : "_out";

  return function (graph, args, gremlin, state) {
    if (!gremlin && (!state.edges || !state.edges.length)) return "pull"; // query init

    if (!state.edges || !state.edges.length) {
      state.gremlin = gremlin;
      state.edges = graph[find_method](gremlin.vertex).filter(
        Dagoba.filterEdges(args[0]) // get matching edges
      );
    }
    if (!state.edges.length) return "pull";

    var vertex = state.edges.pop()[edge_list]; // use up an edge
    return Dagoba.gotoVertex(state.gremlin, vertex);
  };
};

Dagoba.addPipetype("out", Dagoba.simpleTraversal("out"));
Dagoba.addPipetype("in", Dagoba.simpleTraversal("in"));
