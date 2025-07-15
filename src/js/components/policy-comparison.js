// Policy Comparison Web Component

class PolicyComparison extends HTMLElement {
  constructor() {
    super();
    this.policyData = null;
  }

  static get observedAttributes() {
    return ['policy-category', 'politician-id'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.loadPolicyData();
    }
  }

  async loadPolicyData() {
    const category = this.getAttribute('policy-category');
    const politicianId = this.getAttribute('politician-id');

    if (!category || !politicianId) return;

    try {
      // Mock data loading - in real implementation, this would be an API call
      this.policyData = await this.fetchPolicyData(politicianId, category);
      this.render();
    } catch (error) {
      console.error('Failed to load policy data:', error);
      this.renderError();
    }
  }

  async fetchPolicyData(politicianId, category) {
    // Mock implementation
    return {
      category: category,
      statedPosition: 'Support for comprehensive reform in this area',
      alignmentScore: Math.floor(Math.random() * 40) + 60, // 60-100%
      statements: [
        {
          text: 'This is a sample public statement about the policy area.',
          source: 'News Interview',
          date: '2023-10-15',
          credibility: 'high'
        }
      ],
      votes: [
        {
          bill: 'Sample Legislation Act',
          vote: 'Yes',
          date: '2023-09-01',
          description: 'Legislation related to this policy area'
        }
      ],
      analysis: {
        consistency: 85,
        notes: 'Shows strong alignment between stated positions and actions'
      }
    };
  }

  render() {
    if (!this.policyData) {
      this.innerHTML = '<div class="loading">Loading policy comparison...</div>';
      return;
    }

    this.innerHTML = `
      <article class="policy-comparison-widget" aria-labelledby="policy-${utils.slugify(this.policyData.category)}">
        <header class="policy-widget-header">
          <h3 id="policy-${utils.slugify(this.policyData.category)}" class="policy-widget-title">
            ${utils.sanitizeHTML(this.policyData.category)}
          </h3>
          <div class="alignment-indicator">
            <span class="alignment-label">Alignment Score:</span>
            <div class="alignment-bar" role="progressbar" 
                 aria-valuenow="${this.policyData.alignmentScore}" 
                 aria-valuemin="0" 
                 aria-valuemax="100"
                 aria-label="Alignment score: ${this.policyData.alignmentScore} out of 100">
              <div class="alignment-fill" style="width: ${this.policyData.alignmentScore}%"></div>
              <span class="alignment-text">${this.policyData.alignmentScore}%</span>
            </div>
          </div>
        </header>

        <div class="policy-widget-content">
          <div class="comparison-tabs" role="tablist" aria-label="Policy comparison views">
            <button class="tab-button active" role="tab" aria-selected="true" 
                    aria-controls="stated-panel" id="stated-tab" tabindex="0">
              Stated Position
            </button>
            <button class="tab-button" role="tab" aria-selected="false" 
                    aria-controls="statements-panel" id="statements-tab" tabindex="-1">
              Public Statements
            </button>
            <button class="tab-button" role="tab" aria-selected="false" 
                    aria-controls="votes-panel" id="votes-tab" tabindex="-1">
              Voting Record
            </button>
          </div>

          <div class="tab-panels">
            <div class="tab-panel active" role="tabpanel" 
                 aria-labelledby="stated-tab" id="stated-panel" tabindex="0">
              <h4 class="sr-only">Stated Position</h4>
              <p class="stated-position">${utils.sanitizeHTML(this.policyData.statedPosition)}</p>
              <div class="position-source">
                <small>Source: Official website and campaign materials</small>
              </div>
            </div>

            <div class="tab-panel" role="tabpanel" 
                 aria-labelledby="statements-tab" id="statements-panel" tabindex="0" hidden>
              <h4 class="sr-only">Public Statements</h4>
              ${this.renderStatements()}
            </div>

            <div class="tab-panel" role="tabpanel" 
                 aria-labelledby="votes-tab" id="votes-panel" tabindex="0" hidden>
              <h4 class="sr-only">Voting Record</h4>
              ${this.renderVotes()}
            </div>
          </div>

          <div class="analysis-summary">
            <h4>Analysis</h4>
            <p>${utils.sanitizeHTML(this.policyData.analysis.notes)}</p>
            <div class="consistency-score">
              Consistency Rating: 
              <span class="score score--${this.getScoreClass(this.policyData.analysis.consistency)}">
                ${this.policyData.analysis.consistency}%
              </span>
            </div>
          </div>
        </div>
      </article>
    `;

    this.setupTabs();
  }

  renderStatements() {
    return this.policyData.statements.map(statement => `
      <blockquote class="public-statement">
        <p>"${utils.sanitizeHTML(statement.text)}"</p>
        <footer>
          <cite>
            ${utils.sanitizeHTML(statement.source)} - 
            <time datetime="${statement.date}">${utils.formatDate(statement.date)}</time>
          </cite>
          <span class="credibility-badge credibility--${statement.credibility}">
            ${statement.credibility} credibility
          </span>
        </footer>
      </blockquote>
    `).join('');
  }

  renderVotes() {
    return this.policyData.votes.map(vote => `
      <div class="vote-record">
        <h5 class="vote-bill">${utils.sanitizeHTML(vote.bill)}</h5>
        <div class="vote-details">
          <span class="vote-decision vote--${vote.vote.toLowerCase()}">
            ${utils.sanitizeHTML(vote.vote)}
          </span>
          <time datetime="${vote.date}" class="vote-date">
            ${utils.formatDate(vote.date)}
          </time>
        </div>
        <p class="vote-description">${utils.sanitizeHTML(vote.description)}</p>
      </div>
    `).join('');
  }

  setupTabs() {
    const tabButtons = this.querySelectorAll('.tab-button');
    const tabPanels = this.querySelectorAll('.tab-panel');

    tabButtons.forEach((button, index) => {
      button.addEventListener('click', () => {
        this.activateTab(index);
      });

      button.addEventListener('keydown', (e) => {
        let newIndex = index;

        switch (e.key) {
          case 'ArrowRight':
            newIndex = (index + 1) % tabButtons.length;
            break;
          case 'ArrowLeft':
            newIndex = (index - 1 + tabButtons.length) % tabButtons.length;
            break;
          case 'Home':
            newIndex = 0;
            break;
          case 'End':
            newIndex = tabButtons.length - 1;
            break;
          default:
            return;
        }

        e.preventDefault();
        this.activateTab(newIndex);
        tabButtons[newIndex].focus();
      });
    });
  }

  activateTab(activeIndex) {
    const tabButtons = this.querySelectorAll('.tab-button');
    const tabPanels = this.querySelectorAll('.tab-panel');

    tabButtons.forEach((button, index) => {
      const isActive = index === activeIndex;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive);
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabPanels.forEach((panel, index) => {
      const isActive = index === activeIndex;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });

    // Announce tab change to screen readers
    const activeTab = tabButtons[activeIndex];
    utils.announce(`Switched to ${activeTab.textContent} tab`);
  }

  getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  renderError() {
    this.innerHTML = `
      <div class="policy-comparison-error" role="alert">
        <p>Unable to load policy comparison data.</p>
        <button onclick="this.parentElement.parentElement.loadPolicyData()">
          Try Again
        </button>
      </div>
    `;
  }
}

// Register the custom element
customElements.define('policy-comparison', PolicyComparison);
