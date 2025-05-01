document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const json = JSON.parse(e.target.result);
        const output = parseBoomiProfile(json);
        document.getElementById('output').textContent = output;
      } catch (err) {
        document.getElementById('output').textContent = 'Invalid JSON';
      }
    };
    reader.readAsText(file);
  });
  
  function parseBoomiProfile(json) {
    if (!json.componentType || !json.structure) return 'Invalid Boomi EDI profile format';
  
    const lines = [];
    function walk(node, depth = 0) {
      const indent = '  '.repeat(depth);
      if (node.segmentId) {
        lines.push(`${indent}${node.segmentId} (${node.name || ''})`);
      }
      if (node.children) {
        node.children.forEach(child => walk(child, depth + 1));
      }
    }
  
    walk(json.structure);
    return lines.join('\n');
  }
  