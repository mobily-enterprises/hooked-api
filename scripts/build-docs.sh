#!/bin/bash

# Build script for syncing documentation files to docs directory with Jekyll front matter

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building documentation...${NC}"

# Create the docs README with Jekyll front matter
cat > docs/README.md << 'EOF'
---
layout: default
title: Hooked API Documentation
permalink: /README.html
---

[← Back to Home](./)

EOF

# Append the main README content
cat README.md >> docs/README.md

# Create the docs API.md with Jekyll front matter
cat > docs/API.md << 'EOF'
---
layout: default
title: API Reference
permalink: /API.html
---

[← Back to Home](./)

EOF

# Append the API content
cat API.md >> docs/API.md

# Create the docs CHEATSHEET.md with Jekyll front matter
cat > docs/CHEATSHEET.md << 'EOF'
---
layout: default
title: Cheatsheet
permalink: /CHEATSHEET.html
---

[← Back to Home](./)

EOF

# Append the CHEATSHEET content
cat CHEATSHEET.md >> docs/CHEATSHEET.md

echo -e "${GREEN}✓ Documentation built successfully!${NC}"
echo -e "${GREEN}  docs/README.md has been updated${NC}"
echo -e "${GREEN}  docs/API.md has been updated${NC}"
echo -e "${GREEN}  docs/CHEATSHEET.md has been updated${NC}"