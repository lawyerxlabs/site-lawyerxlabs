# site-lawyerxlabs

Public LawyerLabs homepage for `https://lawyerxlabs.ca/`. Static HTML/CSS, no build step.

Copy source: SecondBrain `internal/strategy/lawyerlabs/lawyerlabs-homepage-copy.md` (v1, company and category only). The site adds the approved AI/MCP line and educator/organization audience; these need recording as a v2 copy in SecondBrain before publication.

Products section lists status labels only. No product cards are published yet.

## Preview

    python3 -m http.server 8080

## Check

    python3 -c "import html.parser,sys; html.parser.HTMLParser().feed(open('index.html').read()); print('parsed')"
