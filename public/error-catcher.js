var el = document.getElementById('rentvue-errors');
function show(msg) {
  el.style.display = 'block';
  el.textContent = (el.textContent ? el.textContent + '\n---\n' : '') + msg;
}

// Catch ALL errors including module parse/load errors
window.addEventListener('error', function(e) {
  if (e.target === window) return; // handled by onerror below
  var src = e.target.src || e.target.href || 'unknown';
  show('[Module/Load Error] ' + e.message + ' (type: ' + e.type + ', target: ' + e.target.tagName + ', src: ' + src + ')');
}, true);

// Standard runtime errors
window.onerror = function(msg, src, line, col, err) {
  var stack = err && err.stack ? '\n' + err.stack : '';
  show('[Runtime Error] ' + msg + '\n  at ' + src + ':' + line + ':' + col + stack);
};

// Promise rejections
window.addEventListener('unhandledrejection', function(e) {
  show('[Promise Error] ' + (e.reason && (e.reason.message || e.reason.stack) || String(e.reason)));
});

// console.error
var _origError = console.error;
console.error = function() {
  show('[console.error] ' + Array.prototype.slice.call(arguments).map(String).join(' '));
  return _origError.apply(console, arguments);
};
