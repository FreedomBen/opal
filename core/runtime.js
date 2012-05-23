var Opal = this.Opal = {};

Opal.global = this;

// Minify common function calls
var __hasOwn = Object.prototype.hasOwnProperty;
var __slice  = Opal.slice = Array.prototype.slice;

// Types - also added to bridged objects
var T_CLASS      = 0x0001,
    T_MODULE     = 0x0002,
    T_OBJECT     = 0x0004,
    T_BOOLEAN    = 0x0008,
    T_STRING     = 0x0010,
    T_ARRAY      = 0x0020,
    T_NUMBER     = 0x0040,
    T_PROC       = 0x0080,
    T_HASH       = 0x0100,
    T_RANGE      = 0x0200,
    T_ICLASS     = 0x0400,
    FL_SINGLETON = 0x0800;

// Generates unique id for every ruby object
var unique_id = 0;

// Table holds all class variables
Opal.cvars = {};

// Globals table
Opal.gvars = {};

// Define a method alias
Opal.alias = function(klass, new_name, old_name) {
  new_name = mid_to_jsid(new_name);
  old_name = mid_to_jsid(old_name);

  var body = klass._proto[old_name];

  if (!body) {
    // throw RubyNameError.$new(null, "undefined method `" + old_name + "' for class `" + klass._name + "'");
    throw new Error("undefined method `" + old_name + "' for class `" + klass._name + "'");
  }

  define_method(klass, new_name, body);
  return null;
};

// Actually define methods
var define_method = Opal.defn = function(klass, id, body) {
  // If an object, make sure to use its class
  if (klass._flags & T_OBJECT) {
    klass = klass._klass;
  }

  klass._alloc.prototype[id] = body;

  var included_in = klass.$included_in, includee;

  if (included_in) {
    for (var i = 0, ii = included_in.length; i < ii; i++) {
      includee = included_in[i];

      define_method(includee, id, body);
    }
  }

  if (klass._bridge) {
    klass._bridge[id] = body;
  }


  return null;
};

Opal.klass = function(base, superklass, id, body) {
  var klass;
  if (base._flags & T_OBJECT) {
    base = class_real(base._klass);
  }

  if (superklass === null) {
    superklass = RubyObject;
  }

  if (__hasOwn.call(base._scope, id)) {
    klass = base._scope[id];
  }
  else {
    klass = define_class(base, id, superklass);
  }

  return body.call(klass);
};

Opal.sklass = function(shift, body) {
  var klass = shift.$singleton_class();
  return body.call(klass);
}

Opal.module = function(base, id, body) {
  var klass;
  if (base._flags & T_OBJECT) {
    base = class_real(base._klass);
  }

  if (__hasOwn.call(base._scope, id)) {
    klass = base._scope[id];
  }
  else {
    klass = boot_module();
    klass._name = (base === RubyObject ? id : base._name + '::' + id);

    make_metaclass(klass, RubyModule);

    klass._flags = T_MODULE;
    klass.$included_in = [];

    var const_alloc   = function() {};
    var const_scope   = const_alloc.prototype = new base._scope.alloc();
    klass._scope      = const_scope;
    const_scope.alloc = const_alloc;

    base._scope[id]    = klass;
  }

  return body.call(klass);
}

Opal.defs = function(base, id, body) {
  return define_method(base.$singleton_class(), id, body);
};

// Undefine one or more methods
Opal.undef = function(klass) {
  var args = __slice.call(arguments, 1);

  for (var i = 0, length = args.length; i < length; i++) {
    var mid = args[i], id = mid_to_jsid[mid];

    delete klass._proto[id];
  }
};

// This function serves two purposes. The first is to allow methods
// defined in modules to be included into classes that have included
// them. This is done at the end of a module body by calling this
// method will all the defined methods. They are then passed onto
// the includee classes.
//
// The second purpose is to store an array of all the methods defined
// directly in this class or module. This makes features such as
// #methods and #instance_methods work. It is also used internally to
// create subclasses of Arrays, as an annoyance with javascript is that
// arrays cannot be subclassed (or they can't without problems arrising
// with tracking the array length). Therefore, when a new instance of a
// subclass is created, behind the scenes we copy all the methods from
// the subclass onto an array prototype.
//
// @param [RubyClass] klass the class or module that defined methods
// @param [Array<String>] methods an array of jsid method names defined
Opal.donate = function(klass, methods) {
  var included_in = klass.$included_in, includee, method,
      table = klass._proto, dest;

  if (included_in) {
    for (var i = 0, length = included_in.length; i < length; i++) {
      includee = included_in[i];
      dest = includee._proto;
      for (var j = 0, jj = methods.length; j < jj; j++) {
        method = methods[j];
        // if (!dest[method]) {
          dest[method] = table[method];
        // }
      }
      // if our includee is itself inlcuded in another module/class then
      // it should also donate its new methods
      if (includee.$included_in) {
        Opal.donate(includee, methods);
      }
    }
  }
};

// Calls a super method.
Opal.zuper = function(callee, jsid, self, args) {
  var func = find_super(self._klass, callee, jsid);

  if (!func) {
    throw RubyNoMethodError.$new(null, "super: no superclass method `" +
            jsid_to_mid(jsid) + "'" + " for " + self.$inspect());
  }

  return func.apply(self, args);
};

// dynamic super (inside block)
Opal.dsuper = function(scopes, defn, jsid, self, args) {
  var method, scope = scopes[0];

  for (var i = 0, length = scopes.length; i < length; i++) {
    if (scope.o$jsid) {
      jsid = scope.o$jsid;
      method = scope;
      break;
    }
  }

  if (method) {
    // one of the nested blocks was define_method'd
    return Opal.zuper(method, jsid, self, args);
  }
  else if (defn) {
    // blocks not define_method'd, but they were enclosed by a real method
    return Opal.zuper(defn, jsid, self, args);
  }

  // if we get here then we were inside a nest of just blocks, and none have
  // been defined as a method
  throw RubyNoMethodError.$new(null, "super: cannot call super when not in method");
}

// Find function body for the super call
function find_super(klass, callee, mid) {
  var cur_method;

  while (klass) {
    if (klass._proto.hasOwnProperty(mid)) {
      if (klass._proto[mid] === callee) {
        cur_method = klass._proto[mid];
        break;
      }
    }
    klass = klass._super;
  }

  if (!(klass && cur_method)) { return null; }

  klass = klass._super;

  while (klass) {
    if (klass._proto.hasOwnProperty(mid)) {
      // make sure our found method isnt the same - this can happen if this
      // newly found method is from a module and we are now looking at the
      // module it came from.
      if (klass._proto[mid] !== callee) {
        return klass._proto[mid];
      }
    }

    klass = klass._super;
  }
}

var mid_to_jsid = Opal.mid_to_jsid = function(mid) {
  if (method_names[mid]) {
    return method_names[mid];
  }

  return '$' + mid.replace('!', '$b').replace('?', '$p').replace('=', '$e');
};

var jsid_to_mid = Opal.jsid_to_mid = function(jsid) {
  if (reverse_method_names[jsid]) {
    return reverse_method_names[jsid];
  }

  jsid = jsid.substr(1); // remove '$'

  return jsid.replace('$b', '!').replace('$p', '?').replace('$e', '=');
};

// Boot a base class (makes instances).
function boot_defclass(superklass) {
  var cls = function() {
    this._id = unique_id++;
  };

  if (superklass) {
    var ctor           = function() {};
        ctor.prototype = superklass.prototype;

    cls.prototype = new ctor();
  }

  cls.prototype.constructor = cls;
  cls.prototype._flags      = T_OBJECT;

  return cls;
}

// Boot actual (meta classes) of core objects.
function boot_makemeta(id, klass, superklass) {
  var meta = function() {
    this._id = unique_id++;
  };

  var ctor           = function() {};
      ctor.prototype = superklass.prototype;

  meta.prototype = new ctor();

  var proto              = meta.prototype;
      proto.$included_in = [];
      proto._alloc       = klass;
      proto._flags       = T_CLASS;
      proto._name        = id;
      proto._super       = superklass;
      proto.constructor  = meta;

  var result = new meta();
  klass.prototype._klass = result;
  result._proto = klass.prototype;

  Opal[id] = result;

  return result;
}

// Create generic class with given superclass.
function boot_class(superklass) {
  // instances
  var cls = function() {
    this._id = unique_id++;
  };

  var ctor = function() {};
      ctor.prototype = superklass._alloc.prototype;

  cls.prototype = new ctor();

  var proto             = cls.prototype;
      proto.constructor = cls;
      proto._flags      = T_OBJECT;

  // class itself
  var meta = function() {
    this._id = unique_id++;
  };

  var mtor = function() {};
      mtor.prototype = superklass.constructor.prototype;

  meta.prototype = new mtor();

  proto             = meta.prototype;
  proto._alloc      = cls;
  proto._flags      = T_CLASS;
  proto.constructor = meta;
  proto._super      = superklass;

  var result = new meta();
  cls.prototype._klass = result;

  result._proto = cls.prototype;

  return result;
}

function boot_module() {
  // where module "instance" methods go. will never be instantiated so it
  // can be a regular object
  var module_cons = function(){};
  var module_inst = module_cons.prototype;

  // Module itself
  var meta = function() {
    this._id = unique_id++;
  };

  var mtor = function(){};
  mtor.prototype = RubyModule.constructor.prototype;
  meta.prototype = new mtor();

  var proto = meta.prototype;

  proto._alloc      = module_cons;
  proto._flags      = T_MODULE;
  proto.constructor = meta;
  proto._super      = null;

  var module        = new meta();
  module._proto     = module_inst;

  return module;
}

// Get actual class ignoring singleton classes and iclasses.
function class_real(klass) {
  while (klass._flags & FL_SINGLETON) {
    klass = klass._super;
  }

  return klass;
}

// Make metaclass for the given class
function make_metaclass(klass, superklass) {
  if (klass._flags & T_CLASS) {
    if ((klass._flags & T_CLASS) && (klass._flags & FL_SINGLETON)) {
      throw RubyException.$new('too much meta: return klass?');
    }
    else {
      var class_id = "#<Class:" + klass._name + ">",
          meta     = boot_class(superklass);

      meta._name = class_id;
      meta._alloc.prototype = klass.constructor.prototype;
      meta._proto = meta._alloc.prototype;
      meta._flags |= FL_SINGLETON;
      meta._klass = RubyClass;

      klass._klass = meta;

      meta._scope = klass._scope;
      meta.__attached__ = klass;

      return meta;
    }
  }
  else {
    return make_singleton_class(klass);
  }
}

function make_singleton_class(obj) {
  var orig_class = obj._klass,
      class_id   = "#<Class:#<" + orig_class._name + ":" + orig_class._id + ">>";

  klass             = boot_class(orig_class);
  klass._name = class_id;

  klass._flags                |= FL_SINGLETON;
  klass._bridge  = obj;

  obj._klass = klass;

  klass.__attached__ = obj;

  klass._klass = class_real(orig_class)._klass;

  return klass;
}

function bridge_class(constructor, flags, id) {
  var klass     = define_class(RubyObject, id, RubyObject),
      prototype = constructor.prototype;

  klass._alloc = constructor;
  klass._proto = prototype;

  bridged_classes.push(klass);

  prototype._klass = klass;
  prototype._flags = flags;

  return klass;
}

// Define new ruby class
function define_class(base, id, superklass) {
  var klass;

  var class_id = (base === RubyObject ? id : base._name + '::' + id);

  klass             = boot_class(superklass);
  klass._name = class_id;

  make_metaclass(klass, superklass._klass);

  var const_alloc   = function() {};
  var const_scope   = const_alloc.prototype = new base._scope.alloc();
  klass._scope      = const_scope;
  const_scope.alloc = const_alloc;

  base._scope[id] = klass;

  if (superklass.$inherited) {
    superklass.$inherited(klass);
  }

  return klass;
}

function define_iclass(klass, module) {
  var sup = klass._super;

  var iclass = {
    _proto: module._proto,
    _super: sup,
    _flags: T_ICLASS,
    _klass: module,
    _name: module._name
  };

  klass._super = iclass;

  return iclass;
}

// Initialization
// --------------

// The *instances* of core objects
var BootObject = boot_defclass();
var BootModule = boot_defclass(BootObject);
var BootClass  = boot_defclass(BootModule);

// The *classes' of core objects
var RubyObject = boot_makemeta('Object', BootObject, BootClass);
var RubyModule = boot_makemeta('Module', BootModule, RubyObject.constructor);
var RubyClass = boot_makemeta('Class', BootClass, RubyModule.constructor);

// Fix boot classes to use meta class
RubyObject._klass = RubyClass;
RubyModule._klass = RubyClass;
RubyClass._klass = RubyClass;

// fix superclasses
RubyObject._super = null;
RubyModule._super = RubyObject;
RubyClass._super = RubyModule;

// Make object act like a module. Internally, `Object` gets included
// into all the bridged classes. This is because the native prototypes
// for these bridged classes need to get all the `Object` methods as
// well. This allows `Object` to just donate its instance methods to
// the bridged classes using the exact same method that modules use.
var bridged_classes = RubyObject.$included_in = [];

// Top level Object scope (used by object and top_self).
var top_const_alloc     = function(){};
var top_const_scope     = top_const_alloc.prototype;
top_const_scope.alloc   = top_const_alloc; 

RubyObject._scope = Opal.constants = top_const_scope;

var module_const_alloc = function(){};
var module_const_scope = new top_const_alloc();
module_const_scope.alloc = module_const_alloc;
RubyModule._scope = module_const_scope;

var class_const_alloc = function(){};
var class_const_scope = new top_const_alloc();
class_const_scope.alloc = class_const_alloc;
RubyClass._scope = class_const_scope;

RubyObject._scope.BasicObject = RubyObject;
RubyObject._scope.Object = RubyObject;
RubyObject._scope.Module = RubyModule;
RubyObject._scope.Class = RubyClass;

RubyObject._proto.toString = function() {
  return this.$to_s();
};

var top_self = Opal.top = new RubyObject._alloc();

var RubyNilClass  = define_class(RubyObject, 'NilClass', RubyObject);
Opal.nil = new RubyNilClass._alloc();
Opal.nil.call = Opal.nil.apply = function() {
  throw new Error("no block given");
};

bridge_class(Array, T_OBJECT | T_ARRAY, 'Array');
bridge_class(Number, T_OBJECT | T_NUMBER, 'Numeric');

bridge_class(String, T_OBJECT | T_STRING, 'String');
bridge_class(Boolean, T_OBJECT | T_BOOLEAN, 'Boolean');
bridge_class(Function, T_OBJECT | T_PROC, 'Proc');
bridge_class(RegExp, T_OBJECT, 'Regexp');
bridge_class(Error, T_OBJECT, 'Exception');

var breaker = Opal.breaker  = new Error('unexpected break');
    breaker.$t              = function() { throw this; };