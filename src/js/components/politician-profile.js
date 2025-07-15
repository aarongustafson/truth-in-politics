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
      // Try to get politician data from the data attribute first
      const dataAttr = this.getAttribute('data-politician-data');
      if (dataAttr) {
        this.politician = JSON.parse(dataAttr);
      }

      if (!this.politician) {
        // Fallback to getting from API or session storage
        const stored = sessionStorage.getItem('currentPolitician');
        if (stored) {
          this.politician = JSON.parse(stored);
        }
      }

      if (!this.politician) {
        // Extract from URL path
        const pathParts = window.location.pathname.split('/');
        const slug = pathParts[pathParts.length - 2]; // Remove trailing slash
        this.politician = await this.fetchPoliticianBySlug(slug);
      }

      if (this.politician) {
        this.processPositionsData();
        this.render();
      } else {
        this.renderError('Politician not found');
      }
    } catch (error) {
      console.error('Failed to load politician data:', error);
      this.renderError('Failed to load politician data');
    }
  }

  processPositionsData() {
    // Convert positions data to the format expected by the component
    this.profileData = {
      biography: {
        firstElected: this.politician.first_elected || 'Unknown',
        website: this.politician.website || ''
      },
      policyPositions: (this.politician.positions || []).map(position => ({
        category: position.topic_display || position.topic_name,
        stance: position.stance || 'neutral',
        strength: position.strength || 'moderate',
        statedPosition: position.position_summary || 'No position available',
        positionDetails: position.position_details,
        keyPhrases: position.key_phrases,
        confidenceScore: Math.round((position.confidence_score || 0.5) * 100),
        isKeyIssue: position.is_key_issue,
        sourceUrl: position.source_url,
        sourceSection: position.source_section,
        lastUpdated: position.last_updated
      })),
      overallAlignment: this.calculateOverallAlignment()
    };
  }

  calculateOverallAlignment() {
    const positions = this.profileData.policyPositions;
    if (positions.length === 0) return 0;
    
    const totalConfidence = positions.reduce((sum, pos) => sum + pos.confidenceScore, 0);
    return Math.round(totalConfidence / positions.length);
  }

  async fetchPoliticianBySlug(slug) {
    // This would fetch from the API in a real implementation
    // For now, return null and rely on the data attribute
    return null;
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
              <h2 id="overview-heading">Policy Position Overview</h2>
              <div class="overview-grid">
                <div class="overview-card">
                  <h3>Policy Positions Found</h3>
                  <div class="stat-number stat-number--${this.profileData.policyPositions.length > 0 ? 'success' : 'warning'}">
                    ${this.profileData.policyPositions.length}
                  </div>
                  <p>Identified policy topics with stated positions</p>
                </div>
                
                <div class="overview-card">
                  <h3>Average Confidence</h3>
                  <div class="stat-number stat-number--${this.getScoreClass(this.profileData.overallAlignment)}">
                    ${this.profileData.overallAlignment}%
                  </div>
                  <p>Confidence in position extraction accuracy</p>
                </div>
                
                <div class="overview-card">
                  <h3>Key Issues</h3>
                  <div class="stat-number stat-number--info">
                    ${this.profileData.policyPositions.filter(p => p.isKeyIssue).length}
                  </div>
                  <p>High-priority policy positions identified</p>
                </div>
              </div>
            </section>

            ${this.profileData.policyPositions.length > 0 ? this.renderPolicyPositions() : this.renderNoPositions()}
          </div>
        </main>
      </div>
    `;

    this.setupInteractions();
  }

  renderNoPositions() {
    return `
      <section class="no-positions-section" aria-labelledby="no-positions-heading">
        <h2 id="no-positions-heading">Policy Positions</h2>
        <div class="no-positions-message">
          <h3>No policy positions found yet</h3>
          <p>This politician's website hasn't been crawled for policy positions yet, or no clear positions were found on their website.</p>
          <p>Policy positions are extracted from official websites, press releases, and public statements to provide transparency about where politicians stand on key issues.</p>
          ${this.politician.website ? `
            <p>Visit their official website: <a href="${utils.sanitizeHTML(this.politician.website)}" target="_blank" rel="noopener">${utils.sanitizeHTML(this.politician.website)}</a></p>
          ` : ''}
        </div>
      </section>
    `;
  }

  renderPolicyPositions() {
    return `
      <section class="policy-analysis" aria-labelledby="policy-heading">
        <h2 id="policy-heading">Policy Positions</h2>
        <p class="section-description">
          The following positions were extracted from official websites and public statements.
        </p>
        
        ${this.profileData.policyPositions.map(policy => `
          <article class="policy-section" aria-labelledby="policy-${utils.slugify(policy.category)}">
            <header class="policy-section__header">
              <h3 id="policy-${utils.slugify(policy.category)}" class="policy-section__title">
                ${utils.sanitizeHTML(policy.category)}
                ${policy.isKeyIssue ? '<span class="key-issue-badge">Key Issue</span>' : ''}
              </h3>
              <div class="policy-section__meta">
                <span class="stance-indicator stance-indicator--${policy.stance}">
                  ${utils.sanitizeHTML(policy.stance.charAt(0).toUpperCase() + policy.stance.slice(1))}
                </span>
                <span class="strength-indicator strength-indicator--${policy.strength}">
                  ${utils.sanitizeHTML(policy.strength.charAt(0).toUpperCase() + policy.strength.slice(1))}
                </span>
                <span class="confidence-score confidence-score--${this.getScoreClass(policy.confidenceScore)}">
                  ${policy.confidenceScore}% confidence
                </span>
              </div>
            </header>
            
            <div class="policy-section__content">
              <div class="position-summary">
                <h4>Position Summary</h4>
                <p>${utils.sanitizeHTML(policy.statedPosition)}</p>
              </div>
              
              ${policy.keyPhrases ? `
                <div class="key-phrases">
                  <h4>Key Phrases</h4>
                  <p class="key-phrases-text">"${utils.sanitizeHTML(policy.keyPhrases)}"</p>
                </div>
              ` : ''}
              
              <div class="source-info">
                <h4>Source Information</h4>
                <div class="source-details">
                  ${policy.sourceUrl ? `
                    <p><strong>Source URL:</strong> <a href="${utils.sanitizeHTML(policy.sourceUrl)}" target="_blank" rel="noopener">${utils.sanitizeHTML(policy.sourceUrl)}</a></p>
                  ` : ''}
                  ${policy.sourceSection ? `
                    <p><strong>Section:</strong> ${utils.sanitizeHTML(policy.sourceSection)}</p>
                  ` : ''}
                  ${policy.lastUpdated ? `
                    <p><strong>Last Updated:</strong> <time datetime="${policy.lastUpdated}">${utils.formatDate(policy.lastUpdated)}</time></p>
                  ` : ''}
                </div>
              </div>
            </div>
          </article>
        `).join('')}
      </section>
    `;
  }

  getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'low';
    return 'very-low';
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
