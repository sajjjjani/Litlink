const FilterWord = require('../models/FilterWord');
const Warning = require('../models/Warning');
const User = require('../models/User');

const SUSPENSION_DAYS = 7;
const MAX_WARNINGS_BEFORE_SUSPENSION = 3;

class FilterService {
  
  /**
   * Check text for violations and process warnings/suspensions
   * @param {string} text - The text to check
   * @param {string} userId - ID of the user sending the text
   * @param {string} source - Source of the text ('chat', 'discussion', 'voice_chat', 'profile', 'post')
   * @param {string} sourceId - ID of the source (conversationId, threadId, roomId, etc.)
   * @returns {Object} Result with violation info and actions taken
   */
  static async checkAndProcess(text, userId, source = 'chat', sourceId = '') {
    const result = {
      allowed: true,
      hasViolation: false,
      matches: [],
      warningIssued: false,
      warningCount: 0,
      suspended: false,
      message: null,
      censoredText: text
    };
    
    // Validate inputs
    if (!text || typeof text !== 'string') return result;
    if (!userId) return result;
    
    // Check if user is already suspended
    const suspensionCheck = await this.isUserSuspended(userId);
    if (suspensionCheck) {
      result.allowed = false;
      result.hasViolation = true;
      result.message = await this.getSuspensionMessage(userId);
      return result;
    }
    
    // Check text against filter words
    const check = await FilterWord.checkText(text);
    
    if (!check.hasViolation) {
      return result;
    }
    
    result.hasViolation = true;
    result.matches = check.matches;
    
    // Get current warning count
    const currentWarningCount = await Warning.getWarningCount(userId);
    const newWarningNumber = currentWarningCount + 1;
    result.warningCount = newWarningNumber;
    
    // Get the highest severity match for the warning
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    const highestSeverityMatch = check.matches.reduce((highest, match) => {
      return severityLevels[match.severity] > severityLevels[highest.severity] ? match : highest;
    }, check.matches[0]);
    
    // Create censored version of text
    let censoredText = text;
    for (const match of check.matches) {
      const regex = new RegExp(`\\b${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)|(?<=^|\\s)${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      censoredText = censoredText.replace(regex, '***');
    }
    result.censoredText = censoredText;
    
    // Check if this violation should trigger suspension
    const suspensionResult = await Warning.checkAndSuspendIfNeeded(userId, newWarningNumber);
    
    if (suspensionResult.suspended) {
      result.suspended = true;
      result.allowed = false;
      result.message = suspensionResult.message;
      result.warningIssued = true;
      
      // Create warning record for the suspension-triggering violation
      const warning = new Warning({
        userId,
        reason: `Used prohibited word: "${highestSeverityMatch.word}" (SUSPENSION TRIGGERED)`,
        category: highestSeverityMatch.category,
        severity: highestSeverityMatch.severity,
        wordTriggered: highestSeverityMatch.word,
        context: text.substring(0, 500),
        source,
        sourceId,
        warningNumber: newWarningNumber
      });
      await warning.save();
      
      // Update filter word usage stats
      for (const match of check.matches) {
        match.usageCount += 1;
        match.lastTriggered = new Date();
        await match.save();
      }
      
      // Notify via WebSocket if available
      this._notifySuspension(userId, suspensionResult);
      
      return result;
    }
    
    // Create warning record
    const warning = new Warning({
      userId,
      reason: `Used prohibited word: "${highestSeverityMatch.word}"`,
      category: highestSeverityMatch.category,
      severity: highestSeverityMatch.severity,
      wordTriggered: highestSeverityMatch.word,
      context: text.substring(0, 500),
      source,
      sourceId,
      warningNumber: newWarningNumber
    });
    
    await warning.save();
    
    // Update filter word usage stats
    for (const match of check.matches) {
      match.usageCount += 1;
      match.lastTriggered = new Date();
      await match.save();
    }
    
    result.warningIssued = true;
    
    // Generate appropriate warning message based on warning count
    const warningsLeft = MAX_WARNINGS_BEFORE_SUSPENSION - newWarningNumber;
    
    if (warningsLeft === 0) {
      result.message = `⚠️ FINAL WARNING! Your content violates our community guidelines. Next violation will result in a ${SUSPENSION_DAYS}-day suspension.`;
    } else if (warningsLeft === 1) {
      result.message = `⚠️ WARNING ${newWarningNumber}/${MAX_WARNINGS_BEFORE_SUSPENSION}! Please review our community guidelines. ${warningsLeft} more violation will result in suspension.`;
    } else {
      result.message = `⚠️ Warning ${newWarningNumber}/${MAX_WARNINGS_BEFORE_SUSPENSION}: Your message contains prohibited language. Please keep conversations respectful.`;
    }
    
    // Notify via WebSocket if available
    this._notifyWarning(userId, result.message, newWarningNumber, warningsLeft);
    
    return result;
  }
  
  /**
   * Check text without creating warnings (for preview/validation)
   * @param {string} text - The text to check
   * @returns {Object} Result with violation info
   */
  static async checkOnly(text) {
    if (!text || typeof text !== 'string') return { hasViolation: false, matches: [], censoredText: text };
    
    const check = await FilterWord.checkText(text);
    
    if (!check.hasViolation) {
      return { hasViolation: false, matches: [], censoredText: text };
    }
    
    // Create censored version
    let censoredText = text;
    for (const match of check.matches) {
      const regex = new RegExp(`\\b${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)|(?<=^|\\s)${match.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      censoredText = censoredText.replace(regex, '***');
    }
    
    return {
      hasViolation: true,
      matches: check.matches,
      censoredText
    };
  }
  
  /**
   * Get user's warning history
   */
  static async getUserWarnings(userId, limit = 10) {
    return await Warning.getWarningHistory(userId, limit);
  }
  
  /**
   * Get user's current warning count
   */
  static async getWarningCount(userId) {
    return await Warning.getWarningCount(userId);
  }
  
  /**
   * Check if user is suspended
   */
  static async isUserSuspended(userId) {
    const user = await User.findById(userId);
    if (!user) return false;
    
    if (user.isSuspended && user.suspensionEnds) {
      if (new Date() > user.suspensionEnds) {
        // Suspension has expired
        user.isSuspended = false;
        user.suspensionEnds = null;
        user.suspensionReason = null;
        await user.save();
        return false;
      }
      return true;
    }
    return false;
  }
  
  /**
   * Get suspension message for a user
   */
  static async getSuspensionMessage(userId) {
    const user = await User.findById(userId);
    if (!user || !user.isSuspended || !user.suspensionEnds) return null;
    
    const daysLeft = Math.ceil((user.suspensionEnds - new Date()) / (1000 * 60 * 60 * 24));
    return {
      isSuspended: true,
      message: `⛔ Your account is suspended for ${daysLeft} more day(s) due to multiple content violations. Please review our community guidelines.`,
      suspensionEnds: user.suspensionEnds,
      daysLeft: Math.max(0, daysLeft)
    };
  }
  
  /**
   * Get all active filter words (for admin display)
   */
  static async getFilterWords() {
    return await FilterWord.find({ isActive: true }).sort({ word: 1 });
  }
  
  /**
   * Add a new filter word
   */
  static async addFilterWord(word, category, severity, createdBy, notes = '') {
    const existing = await FilterWord.findOne({ word: word.toLowerCase() });
    if (existing) {
      throw new Error('Filter word already exists');
    }
    
    const filterWord = new FilterWord({
      word: word.toLowerCase(),
      category: category || 'profanity',
      severity: severity || 'medium',
      action: 'warn',
      createdBy,
      isActive: true,
      notes
    });
    
    await filterWord.save();
    await FilterWord.clearCache();
    return filterWord;
  }
  
  /**
   * Remove a filter word
   */
  static async removeFilterWord(wordId) {
    const result = await FilterWord.findByIdAndDelete(wordId);
    if (result) {
      await FilterWord.clearCache();
    }
    return result;
  }
  
  /**
   * Toggle filter word active status
   */
  static async toggleFilterWord(wordId, isActive) {
    const filterWord = await FilterWord.findById(wordId);
    if (!filterWord) {
      throw new Error('Filter word not found');
    }
    
    filterWord.isActive = isActive;
    await filterWord.save();
    await FilterWord.clearCache();
    return filterWord;
  }
  
  /**
   * Send warning notification via WebSocket
   */
  static _notifyWarning(userId, message, warningNumber, warningsLeft) {
    try {
      const io = global.io;
      if (io && io.sendToUser) {
        io.sendToUser(userId, {
          type: 'content_warning',
          title: 'Content Warning',
          message: message,
          warningNumber,
          warningsLeft,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending warning notification:', error);
    }
  }
  
  /**
   * Send suspension notification via WebSocket
   */
  static _notifySuspension(userId, suspensionResult) {
    try {
      const io = global.io;
      if (io && io.sendToUser) {
        io.sendToUser(userId, {
          type: 'account_suspended',
          title: 'Account Suspended',
          message: suspensionResult.message,
          suspensionEnds: suspensionResult.suspensionEnds,
          daysLeft: suspensionResult.daysLeft,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error sending suspension notification:', error);
    }
  }
}

module.exports = FilterService;