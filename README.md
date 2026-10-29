# webMCP-comparer

> **This repository is archived.** The maintained comparer and its bare demo shop now live in [sredhu37/webmcp-101](https://github.com/sredhu37/webmcp-101).

The comparer runs the same Scenario on a website in two lanes: a Baseline lane without WebMCP and a WebMCP lane with the site's tools. It compares time, steps, tokens, cost, tool calls and screenshots.

## Use the maintained repository

```bash
git clone https://github.com/sredhu37/webmcp-101.git
cd webmcp-101/app && npm install && npm start
```

In a second terminal:

```bash
cd webmcp-101/webmcp-comparer && npm install && npm run dev
```

Open http://localhost:3000 and compare the shop at http://localhost:4000.

The new repository also has the build-along shop with no WebMCP tools on `main`, ready for the `webmcp` step branches.

[![Buy me a coffee on Ko-fi](https://img.shields.io/badge/Buy%20me%20a%20coffee-Ko--fi-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/sunnyredhu)
