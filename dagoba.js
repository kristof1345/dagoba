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
  console.log(vertex._id);
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

Dagoba.G.findVertexById = function (vertex_id) {
  return this.vertexIndex[vertex_id];
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

Dagoba.Q.run = function () {
  // our virtual machine for query processing
  this.program = Dagoba.transform(this.program); // activate the transformers

  var max = this.program.length - 1; // last step in the program
  var maybe_gremlin = false; // a gremlin, a signal string, or false
  var results = []; // results for this particular run
  var done = -1; // behindwhich things have finished
  var pc = max; // our program counter -- we start from the end

  var step, state, pipetype;

  // driver loop
  while (done < max) {
    step = this.program[pc]; // step is an array: first the pipe type, then its args
    state = this.state[pc] = this.state[pc] || {}; // the state for this step: ensure it's always an object
    pipetype = Dagoba.getPipetype(step[0]); // a pipetype is just a function

    maybe_gremlin = pipetype(this.graph, step[1], maybe_gremlin, state);

    if (maybe_gremlin == "pull") {
      // 'pull' tells us the pipe wants further input
      maybe_gremlin = false;
      if (pc - 1 > done) {
        pc--; // try the previous pipe
        continue;
      } else {
        done = pc; // previous pipe is finished, so we are too
      }
    }

    if (maybe_gremlin == "done") {
      // 'done' tells us the pipe is finished
      maybe_gremlin = false;
      done = pc;
    }

    pc++; // move on to the next pipe

    if (pc > max) {
      if (maybe_gremlin) results.push(maybe_gremlin); // a gremlin popped out the end of the pipeline
      maybe_gremlin = false;
      pc--; // take a step back
    }
  }

  results = results.map(function (gremlin) {
    // return either results (like property('name')) or vertices
    return gremlin.result != null ? gremlin.result : gremlin.vertex;
  });

  return results;
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

Dagoba.addPipetype("property", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull"; // init query
  gremlin.result = gremlin.vertex[args[0]];
  return gremlin.result == null ? false : gremlin; // false for bad props
});

Dagoba.addPipetype("unique", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull"; // init query
  if (state[gremlin.vertex._id]) return "pull";
  state[gremlin.vertex._id] = true;
  return gremlin; // false for bad props
});

Dagoba.addPipetype("filter", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull"; // init query

  if (typeof args[0] === "object") {
    return Dagoba.objectFilter(gremlin.vertex, args[0]) ? gremlin : "pull";
  }

  if (typeof args[0] != "function") {
    Dagoba.error("Filter is not a function: " + args[0]);
    return gremlin; // keep things moving
  }

  if (!args[0](gremlin.vertex, gremlin)) return "pull"; // gremlin fails filter
  return gremlin;
});

Dagoba.addPipetype("take", function (graph, args, gremlin, state) {
  state.taken = state.taken || 0; // init state

  if (state.taken == args[0]) {
    state.taken = 0;
    return "done"; // all done
  }

  if (!gremlin) return "pull";
  state.taken++;
  return gremlin;
});

Dagoba.addPipetype("as", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull";
  gremlin.state.as = gremlin.state.as || {}; // init the 'as' state
  gremlin.state.as[args[0]] = gremlin.vertex; // set label to vertex
  return gremlin;
});

Dagoba.addPipetype("merge", function (graph, args, gremlin, state) {
  if (!state.vertices && !gremlin) return "pull";

  if (!state.vertices || !state.vertices.length) {
    var obj = (gremlin.state || {}).as || {};
    state.vertices = args
      .map(function (id) {
        return obj[id];
      })
      .filter(Boolean);
  }

  if (!state.vertices.length) return "pull";

  var vertex = state.vertices.pop();
  return Dagoba.makeGremlin(vertex, gremlin.state);
});

Dagoba.addPipetype("merge", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull";

  if (gremlin.vertex == gremlin.state.as[args[0]]) return "pull";

  return gremlin;
});

Dagoba.addPipetype("back", function (graph, args, gremlin, state) {
  if (!gremlin) return "pull"; // query initialization
  return Dagoba.gotoVertex(gremlin, gremlin.state.as[args[0]]);
});

// let V = [
//   { name: "alice" }, // alice gets auto-_id (prolly 1)
//   { _id: 10, name: "bob", hobbies: ["asdf", { x: 3 }] },
// ];
// let E = [{ _out: 1, _in: 10, _label: "knows" }];
// let g = Dagoba.graph(V, E);

// g.v("Thor").out("parent").out("parent").run();
