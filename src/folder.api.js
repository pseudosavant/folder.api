// folder.api: version 1.0.1

(function folderApiIIFE(global) {
  'use strict';

  function urlType(url) {
    if (isHiddenFileOrFolder(url)) {
      return 'hidden';
    } else if (isFolder(url)) {
      return 'folder';
    } else if (isFile(url)) {
      return 'file';
    } else {
      return 'unknown';
    }
  }

  function isFolder(url) {
    return (url[url.length - 1] === '/');
  }

  function isFile(url) {
    return !isFolder(url);
  }

  function isHiddenFileOrFolder(url) {
    const reHidden = /\/\..+$/i;
    return url.toString().match(reHidden);
  }

  function parentFolder(url) {
    const parts = url.split('/');
    parts.pop(); // Remove trailing /
    parts.pop(); // Remove current folder
    return parts.join('/') + '/';
  }

  function urlToFoldername(url){
    var pieces = url.split('/');
    return pieces[pieces.length - 2]; // Return piece before final `/`
  }

  function urlToFilename(url) {
    const re = /\/([^/]+)$/;
    const parts = re.exec(url);
    return (parts && parts.length > 1 ? parts[1] : url);
  }

  async function linkToMetadata(node, server) {
    return (
      typeof servers[server] === 'function' ?
      servers[server](node) :
      {}
    );
  }

  async function getHeaderData(url) {
    if (!url) return {};

    try {
      const res = await fetch(url);
      const h = res.headers;
      return h;
    } catch (e) {
      console.warn(e);
      return {};
    }
  }

  async function getServer(url) {
    const h = await getHeaderData(url);
    const server = (h.get('Server') ? h.get('Server').toString().toLowerCase() : undefined);
    if (server && server.includes) {
      if (server.includes('nginx')) {
        return 'nginx';
      } else if (server.includes('apache')) {
        return 'apache';
      } else if (server.includes('iis')) {
        return 'iis'
      }
    }

    return 'generic';
  }

  const servers = {
    apache: function (node) {
      const metadata = { date: undefined, size: undefined };

      if (!node.parentNode || !node.parentNode.parentNode) return metadata;

      const row = node.parentNode.parentNode;

      const dateNode = row.querySelector('td:nth-of-type(3)');
      if (dateNode) {
        const dateRe = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/g;
        const dateResults = dateRe.exec(dateNode.textContent);

        if (dateResults) {
          const y = toNumber(dateResults[1]) || undefined;
          const m = toNumber(dateResults[2]) || undefined;
          const d = toNumber(dateResults[3]) || undefined;
          const hours = toNumber(dateResults[4]) || undefined;
          const mins = toNumber(dateResults[5]) || undefined;
          metadata.date = new Date(`${m}-${d}, ${y} ${hours}:${mins}:00`);
        }
      }

      const sizeNode = row.querySelector('td:nth-of-type(4)');

      if (sizeNode) {
        const sizeRe = /(\d+)(\w)?/g;
        const sizeResults = sizeRe.exec(sizeNode.textContent);

        if (sizeResults) {
          const val = toNumber(sizeResults[1]);
          const unit = (isUndefined(sizeResults[2]) ? 'B' : sizeResults[2]);

          const factor = {
            B: 0, K: 1, M: 2, G: 3, T: 4
          }

          metadata.size = Math.floor(
            val * Math.pow(1024, factor[unit])
          );
        }
      }

      return metadata;
    },
    nginx: function(node) {
      const metadata = { date: undefined, size: undefined };

      const metadataNode = node.nextSibling;
      if (!metadataNode) return metadata;

      const text = metadataNode.textContent;
      const re = /(\d{2})-(\w{3})-(\d{4})\s(\d{2}):(\d{2})\s+(\d+)?/g;
      const results = re.exec(text);

      if (!results) return metadata;
      const d = toNumber(results[1]) || undefined;
      const m = results[2] || undefined;
      const y = toNumber(results[3]) || undefined;
      const hours = toNumber(results[4]) || undefined;
      const mins = toNumber(results[5]) || undefined;
      metadata.date = new Date(`${m}-${d}, ${y} ${hours}:${mins}:00`);

      metadata.size = toNumber(results[6]) || undefined;

      return metadata;
    },
    iis: function(node) {
      const metadata = { date: undefined, size: undefined };

      const metadataNode = node.previousSibling;
      if (!metadataNode) return metadata;

      const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2})\s(AM|PM)\s+(\d+)?/i;
      const text = metadataNode.textContent;
      const results = re.exec(text);
      if (!results) return metadata;

      const m = toNumber(results[1]) || undefined;
      const d = toNumber(results[2]) || undefined;
      const y = toNumber(results[3]) || undefined;
      const hours = toNumber(results[4]) || undefined;
      const mins = toNumber(results[5]);
      metadata.date = new Date(`${m}-${d}, ${y} ${hours}:${mins}:00`);

      metadata.size = toNumber(results[7]) || undefined;

      return metadata;
    },
    fallback: function(node) {
      const metadata = { date: undefined, size: undefined };

      const metadataNode = node.nextSibling;
      if (!metadataNode) return metadata;

      const text = metadataNode.textContent;
      const re = /(\d{2})-(\w{3})-(\d{4})\s(\d{2}):(\d{2})\s+(\d+)?/g;
      const results = re.exec(text);

      if (!results) return metadata;
      const d = toNumber(results[1]) || undefined;
      const m = results[2] || undefined;
      const y = toNumber(results[3]) || undefined;
      const hours = toNumber(results[4]) || undefined;
      const mins = toNumber(results[5]) || undefined;
      metadata.date = new Date(`${m}-${d}, ${y} ${hours}:${mins}:00`);

      metadata.size = toNumber(results[6]) || undefined;

      return metadata;
    },
  }

  async function getLinksFromFrame(frame, baseUrl) {
    const server = await getServer(baseUrl) || 'generic';

    var query;

    switch (server) {
      case 'apache':
        query = 'td a';

        if ([...frame.contentDocument.querySelectorAll(query)].length === 0) {
          query = 'a'; // Fallback to any `<a>` if none are found
        }

        break;
      case 'iis':
      case 'nginx':
      default:
        query = 'a';
        break;
    }

    const links = [...frame.contentDocument.querySelectorAll(query)];
    const folders = [];
    const files = [];

    for (var i = 0; i < links.length; i++) {
      const link = links[i];
      const url = link.toString();
      const type = urlType(url);

      var target;
      const metadata = await linkToMetadata(link, server);
      const res = { url };

      switch (type) {
        case 'folder':
          res.name = urlToFoldername(url);
          res.type = 'child';
          target = folders;
          break;
        case 'file':
          res.name = urlToFilename(url);
          target = files;
          break;
      }

      if (metadata.size) res.size = metadata.size;
      if (metadata.date) res.date = metadata.date;

      if (target === folders) {
        if (server === 'apache' && !metadata.date || // Apache never has a date for parent folders
          url === '../' ||
          url === parentFolder(baseUrl)
        ) {
          res.type = 'parent';
        } else if (url === '/') {
          res.type =  'root';
        }
      }

      target.push(res);

    }
    return { server, folders, files };
  }

  async function folderApiRequest(url) {
    const $frame = document.createElement('iframe');
    $frame.style.visibility = 'hidden';

    const promise = new Promise((resolve, reject) => {
      $frame.addEventListener('error', reject, false);

      $frame.addEventListener('load', async () => {
        const links = await getLinksFromFrame($frame, url);
        $frame.parentElement.removeChild($frame);

        resolve(links);
      }, false);
    });

    document.body.appendChild($frame);
    $frame.src = url; // Setting src starts loading

    return promise;
  }

  function toNumber(d) {
    return parseInt(d, 10);
  }

  function isUndefined(v) {
    return typeof v === 'undefined';
  }

  global.folderApiRequest = folderApiRequest;
})(this);