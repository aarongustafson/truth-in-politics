// Politician Profile Web Component

class PoliticianProfile extends HTMLElement {
  constructor() {
    super();
    this.politician = null;
    this.profileData = null;
  }

  connectedCallback() {
    this.loadPoliticianData();
  }

  async loadPoliticianData() {
    try {
      // Get politician from session storage or URL
      const stored = sessionStorage.getItem('currentPolitician');
      if (stored) {
        this.politician = JSON.parse(stored);
      }

      if (!this.politician) {
        // Extract from URL path
        const pathParts = window.location.pathname.split('/');
        const slug = pathParts[pathParts.length - 2]; // Remove trailing slash
        this.politician = await this.fetchPoliticianBySlug(slug);
      }

      if (this.politician) {
        await this.loadProfileData();
        this.render();
      } else {
        this.renderError('Politician not found');
      }
    } catch (error) {
      console.error('Failed to load politician data:', error);
      this.renderError('Failed to load politician data');
    }
  }

  async fetchPoliticianBySlug(slug) {
    // Mock implementation - in real app, this would be an API call
    const mockPoliticians = {
      'alexandria-ocasio-cortez': {
        id: 'aoc',
        name: 'Alexandria Ocasio-Cortez',
        party: 'Democratic',
        state: 'NY',
        chamber: 'House',
        district: '14th District',
        title: 'Representative'
      },
      'ted-cruz': {
        id: 'ted-cruz',
        name: 'Ted Cruz',
        party: 'Republican',
        state: 'TX',
        chamber: 'Senate',
        title: 'Senator'
      }
    };

    return mockPoliticians[slug] || null;
  }

  async loadProfileData() {
    // Mock profile data - in real implementation, this would fetch comprehensive data
    this.profileData = {
      biography: {
        birthDate: '1989-10-13',
        education: 'Boston University (BA, Economics), Boston University (International Relations)',
        previousOccupation: 'Bartender, Community Organizer',
        firstElected: '2018',
        website: 'https://ocasio-cortez.house.gov'
      },
      policyPositions: [
        {
          category: 'Climate Change',
          alignmentScore: 92,
          statedPosition: 'Supports the Green New Deal and aggressive action on climate change',
          publicStatements: [
            {
              text: 'Climate change is the single biggest national security threat for our generation.',
              source: 'CNN Interview',
              date: '2023-09-15',
              url: '#'
            }
          ],
          votingRecord: [
            {
              bill: 'Inflation Reduction Act (Climate Provisions)',
              vote: 'Yes',
              date: '2022-08-12',
              description: 'Major climate investment package'
            }
          ]
        },
        {
          category: 'Healthcare',
          alignmentScore: 88,
          statedPosition: 'Supports Medicare for All universal healthcare system',
          publicStatements: [
            {
              text: 'Healthcare is a human right, not a privilege based on income.',
              source: 'Town Hall Meeting',
              date: '2023-07-22',
              url: '#'
            }
          ],
          votingRecord: [
            {
              bill: 'Lower Drug Costs Now Act',
              vote: 'Yes',
              date: '2023-03-15',
              description: 'Allow Medicare to negotiate prescription drug prices'
            }
          ]
        },
        {
          category: 'Economic Policy',
          alignmentScore: 85,
          statedPosition: 'Supports progressive taxation and increased minimum wage',
          publicStatements: [
            {
              text: 'No one should work 40 hours a week and still need government assistance to survive.',
              source: 'Committee Hearing',
              date: '2023-11-08',
              url: '#'
            }
          ],
          votingRecord: [
            {
              bill: 'Raise the Wage Act',
              vote: 'Yes',
              date: '2023-05-10',
              description: 'Increase federal minimum wage to $15/hour'
            }
          ]
        }
      ],
      overallAlignment: 88
    };
  }

  render() {
    if (!this.politician || !this.profileData) return;

    this.innerHTML = `
      <div class="politician-profile">
        <header class="politician-header">
          <div class="container">
            <h1 class="politician-header__name">${utils.sanitizeHTML(this.politician.name)}</h1>
            <p class="politician-header__title">
              ${utils.sanitizeHTML(this.politician.title)} from ${utils.sanitizeHTML(this.politician.state)}
              ${this.politician.district ? `, ${utils.sanitizeHTML(this.politician.district)}` : ''}
            </p>
            <p class="politician-header__party">${utils.sanitizeHTML(this.politician.party)} Party</p>
          </div>
        </header>

        <main class="politician-content" id="main">
          <div class="container">
            <section class="overview-section" aria-labelledby="overview-heading">
              <h2 id="overview-heading">Overview</h2>
              <div class="overview-grid">
                <div class="overview-card">
                  <h3>Overall Alignment Score</h3>
                  <div class="alignment-score alignment-score--${this.getScoreClass(this.profileData.overallAlignment)}">
                    ${this.profileData.overallAlignment}%
                  </div>
                  <p>How closely their actions align with their stated positions</p>
                </div>
                
                <div class="overview-card">
                  <h3>Policy Areas Analyzed</h3>
                  <div class="stat-number">${this.profileData.policyPositions.length}</div>
                  <p>Major policy categories reviewed</p>
                </div>
                
                <div class="overview-card">
                  <h3>First Elected</h3>
                  <div class="stat-number">${this.profileData.biography.firstElected}</div>
                  <p>Years in current office: ${new Date().getFullYear() - parseInt(this.profileData.biography.firstElected)}</p>
                </div>
              </div>
            </section>

            <section class="policy-analysis" aria-labelledby="policy-heading">
              <h2 id="policy-heading">Policy Position Analysis</h2>
              <p class="section-description">
                Compare stated positions with public statements and voting records across major policy areas.
              </p>
              
              ${this.renderPolicyPositions()}
            </section>
          </div>
        </main>
      </div>
    `;

    this.setupInteractions();
  }

  renderPolicyPositions() {
    return this.profileData.policyPositions.map(policy => `
      <article class="policy-section" aria-labelledby="policy-${utils.slugify(policy.category)}">
        <header class="policy-section__header">
          <h3 id="policy-${utils.slugify(policy.category)}" class="policy-section__title">
            ${utils.sanitizeHTML(policy.category)}
          </h3>
          <div class="policy-section__score">
            Alignment Score: 
            <span class="alignment-score alignment-score--${this.getScoreClass(policy.alignmentScore)}">
              ${policy.alignmentScore}%
            </span>
          </div>
        </header>
        
        <div class="policy-section__content">
          <div class="policy-comparison-grid">
            <div class="comparison-item">
              <h4 class="comparison-item__header">Stated Position</h4>
              <div class="comparison-item__content">
                ${utils.sanitizeHTML(policy.statedPosition)}
              </div>
              <div class="comparison-item__source">
                Source: Official website and campaign materials
              </div>
            </div>
            
            <div class="comparison-item">
              <h4 class="comparison-item__header">Public Statements</h4>
              <div class="comparison-item__content">
                ${policy.publicStatements.map(statement => `
                  <blockquote>
                    "${utils.sanitizeHTML(statement.text)}"
                    <footer>
                      <cite>
                        ${utils.sanitizeHTML(statement.source)} - 
                        <time datetime="${statement.date}">${utils.formatDate(statement.date)}</time>
                      </cite>
                    </footer>
                  </blockquote>
                `).join('')}
              </div>
            </div>
            
            <div class="comparison-item">
              <h4 class="comparison-item__header">Voting Record</h4>
              <div class="comparison-item__content">
                ${policy.votingRecord.map(vote => `
                  <div class="vote-item">
                    <strong>${utils.sanitizeHTML(vote.bill)}</strong><br>
                    Vote: <span class="vote-${vote.vote.toLowerCase()}">${utils.sanitizeHTML(vote.vote)}</span><br>
                    <small>${utils.sanitizeHTML(vote.description)}</small><br>
                    <time datetime="${vote.date}">${utils.formatDate(vote.date)}</time>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </article>
    `).join('');
  }

  getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  setupInteractions() {
    // Add any interactive functionality here
    // For example, expandable sections, tooltips, etc.
  }

  renderError(message) {
    this.innerHTML = `
      <div class="error-state" role="alert" aria-live="assertive">
        <div class="container">
          <h1>Error</h1>
          <p>${utils.sanitizeHTML(message)}</p>
          <p><a href="/">Return to search</a></p>
        </div>
      </div>
    `;
  }
}

// Register the custom element
customElements.define('politician-profile', PoliticianProfile);
