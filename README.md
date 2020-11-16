# folder.api
`folder.api` turns your HTTP server's file browsing into an API you can consume via JavaScript

## Usage

```javascript
const filesAndFolders = await folderApiRequest(url);

filesAndFolders; //{
  "server": "nginx",
  "folders": [
    {
      "url": "https://httphttp.local/code/folder.api/server/",
      "name": "server",
      "type": "parent"
    },
    {
      "url": "https://http.local/code/folder.api/server/nginx/folder%201/",
      "name": "folder%201",
      "type": "child",
      "date": "2020-10-06T13:59:00.000Z"
    }
  ],
  "files": [
    {
      "url": "https://http.local/code/folder.api/server/nginx/Red.png",
      "name": "Red.png",
      "size": 150,
      "date": "2000-10-10T20:07:00.000Z"
    },
    {
      "url": "https://http.local/code/folder.api/server/nginx/long%20filename.jpg",
      "name": "long%20filename.jpg",
      "size": 931,
      "date": "1999-01-01T17:02:00.000Z"
    }
  ]
}
```

### Supported features

* Query HTTP web servers with folder/directory listing enabled
* Basic metadata (size, date), if available

### Supported Web Servers

* NGINX ([`autoindex`](https://nginx.org/en/docs/http/ngx_http_autoindex_module.html) on)
* Apache ([`mod_autoindex`](https://cwiki.apache.org/confluence/display/HTTPD/DirectoryListings))
* IIS (enable [`Directory Browsing`](https://docs.microsoft.com/en-us/iis/configuration/system.webserver/directorybrowse))
* Generic fallback - YMMV

## License

* [MIT](./LICENSE)

&copy; 2020 Paul Ellis
