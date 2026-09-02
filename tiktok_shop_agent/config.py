"""Agent configuration. Edit these, or override on the command line."""

# The niche the agent researches. Faceless, high-visual-proof niches convert
# best for a beginner: cleaning gadgets, kitchen gadgets, home organization,
# pet grooming, car accessories.
NICHE = "home and cleaning gadgets"

# Market region (affects which products/prices are relevant).
REGION = "United States"

# Claude model. opus-5 is the most capable; drop to "claude-sonnet-5" to cut
# cost if you run this often.
MODEL = "claude-opus-5"

# Max web searches per run (each costs a little; 8-12 is plenty).
MAX_SEARCHES = 10
