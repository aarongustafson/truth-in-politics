# Truth in Politics

A platform to compare U.S. politicians' stated positions with their public statements and voting records, promoting transparency and accountability in government.

## Features

- **Politician Search**: Find current U.S. House Representatives and Senators
- **Position Analysis**: Compare stated policy positions with actual voting records
- **Public Statement Tracking**: Cross-reference positions with verified public statements
- **Accessibility First**: WCAG 2.1 AA compliant design
- **Static Site**: Built with Eleventy for fast, reliable performance
- **Offline Support**: Progressive Web App capabilities

## Technology Stack

- **Static Site Generator**: [Eleventy](https://www.11ty.dev/)
- **Frontend**: Web Components, vanilla JavaScript
- **Database**: SQLite with better-sqlite3 for caching
- **Styling**: CSS with accessibility-first design
- **Deployment**: Ready for GitHub Pages, Netlify, or Vercel

## Getting Started

### Prerequisites

- Node.js 16 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/truth-in-politics.git
cd truth-in-politics
```

2. Install dependencies:
```bash
npm install
```

3. Initialize the database with sample data:
```bash
node scripts/init-data.js
```

4. Start the development server:
```bash
npm start
```

5. Open your browser to `http://localhost:8080`

### Available Scripts

- `npm start` - Start development server with live reload
- `npm run build` - Build the static site for production
- `npm run clean` - Clean the build directory

## Project Structure

```
truth-in-politics/
├── src/
│   ├── _data/           # Eleventy data files
│   ├── _includes/       # Layouts and templates
│   ├── css/             # Stylesheets
│   ├── js/              # JavaScript and web components
│   │   ├── components/  # Web components
│   │   └── database.js  # Database utilities
│   ├── assets/          # Images and static assets
│   ├── index.njk        # Homepage
│   ├── about.njk        # About page
│   ├── methodology.njk  # Methodology page
│   └── politician.njk   # Politician profile template
├── scripts/
│   └── init-data.js     # Database initialization script
├── data/                # SQLite database files (created automatically)
├── .eleventy.js         # Eleventy configuration
└── package.json
```

## Accessibility Features

This project prioritizes accessibility and follows WCAG 2.1 AA guidelines:

- **Semantic HTML**: Proper heading hierarchy and landmark elements
- **Keyboard Navigation**: Full keyboard accessibility for all interactive elements
- **Screen Reader Support**: ARIA labels and live regions for dynamic content
- **Focus Management**: Visible focus indicators and logical tab order
- **Color Contrast**: Meets AA standards for text and interactive elements
- **Responsive Design**: Works on all device sizes
- **Reduced Motion**: Respects user preferences for reduced motion

## Data Sources

- **Official Records**: Congress.gov for voting records
- **News Sources**: Reputable outlets with high credibility ratings
- **Official Websites**: Congressional and campaign websites
- **Third-party Services**: GovTrack, Ballotpedia for additional verification

## Contributing

We welcome contributions! Please see our contributing guidelines for details on:

- Code style and standards
- Accessibility requirements
- Data source verification
- Testing procedures

## Methodology

Our analysis methodology is designed to be:

- **Objective**: Consistent criteria applied to all politicians
- **Transparent**: All sources cited and methodology documented
- **Verifiable**: Claims backed by official records and reputable sources
- **Non-partisan**: Equal treatment regardless of political affiliation

See our [Methodology page](src/methodology.njk) for detailed information.

## Privacy and Data

- No personal data collection beyond standard web analytics
- No tracking of individual users
- All politician data sourced from public records
- Caching used only for performance optimization

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Deployment

### GitHub Pages

1. Build the site: `npm run build`
2. The `_site` directory contains the static files
3. Configure GitHub Pages to serve from the `_site` directory

### Netlify

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `_site`

### Vercel

1. Connect your repository to Vercel
2. Framework preset: Other
3. Build command: `npm run build`
4. Output directory: `_site`

## Support

- **Documentation**: See the `/docs` directory for detailed guides
- **Issues**: Report bugs and request features via GitHub Issues
- **Contact**: Email info@truthinpolitics.org for general inquiries

## Acknowledgments

- Inspired by the need for greater transparency in politics
- Built with modern web standards and accessibility in mind
- Thanks to the open source community for the tools that make this possible
