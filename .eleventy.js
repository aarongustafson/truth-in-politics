const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');
const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function(eleventyConfig) {
  // Add plugins
  eleventyConfig.addPlugin(syntaxHighlight);

  // Configure markdown
  let markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: true
  }).use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.ariaHidden({
      placement: 'after',
      class: 'direct-link',
      symbol: '#'
    }),
    level: [1, 2, 3, 4],
    slugify: eleventyConfig.getFilter('slug')
  });
  
  eleventyConfig.setLibrary('md', markdownLibrary);

  // Copy static assets
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/js');
  eleventyConfig.addPassthroughCopy('src/css');

  // Add collections
  eleventyConfig.addCollection('politicians', function(collectionApi) {
    // This will now use the politicians data from _data/politicians.js
    // The data is automatically available in templates
    return [];
  });

  // Add custom filters
  eleventyConfig.addFilter('dateFormat', function(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  });

  eleventyConfig.addFilter('slugify', function(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  });

  // Watch targets
  eleventyConfig.addWatchTarget('./src/css/');
  eleventyConfig.addWatchTarget('./src/js/');

  return {
    templateFormats: ['md', 'njk', 'html', 'liquid'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk',
    dir: {
      input: 'src',
      includes: '_includes',
      data: '_data',
      output: '_site'
    }
  };
};
