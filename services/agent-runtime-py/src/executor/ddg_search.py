"""DuckDuckGo web search tool for the executor agent.

Free, no API key required. Uses duckduckgo-search package.
"""

from langchain_core.tools import tool


@tool
async def web_search(query: str) -> str:
    """Search the internet using DuckDuckGo. Returns top search results with titles, URLs, and snippets.
    Use this when you need to find current information from the web."""
    try:
        from duckduckgo_search import AsyncDDGS

        async with AsyncDDGS() as ddgs:
            results = []
            async for r in ddgs.atext(query, max_results=5):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })

            if not results:
                return "No search results found."

            formatted = []
            for i, r in enumerate(results, 1):
                formatted.append(
                    f"{i}. **{r['title']}**\n"
                    f"   URL: {r['url']}\n"
                    f"   {r['snippet']}"
                )
            return "\n\n".join(formatted)

    except ImportError:
        return "Web search not available (duckduckgo-search not installed)"
    except Exception as e:
        return f"Search failed: {e}"
