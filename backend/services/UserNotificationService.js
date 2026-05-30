const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');

// Cache for notification preference checks to avoid repeated DB lookups
const _notifPrefCache = new Map();

async function _checkNotifSetting(userId, key) {
  const cacheKey = `${userId}:${key}`;
  const cached = _notifPrefCache.get(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const settings = await UserSettings.findOne({ userId }).lean();
    const allowed = settings?.notifications?.[key] !== false; // default true
    _notifPrefCache.set(cacheKey, allowed);
    setTimeout(() => _notifPrefCache.delete(cacheKey), 5000);
    return allowed;
  } catch {
    return true;
  }
}

function _invalidateUserCache(userId) {
  for (const key of _notifPrefCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      _notifPrefCache.delete(key);
    }
  }
}

class UserNotificationService {

  static async onFollow(follower, targetUserId) {
    try {
      // Don't notify if someone follows themselves (edge case)
      if (follower._id.toString() === targetUserId.toString()) return;

      // Check if user has new follower notifications enabled
      const allowed = await _checkNotifSetting(targetUserId, 'newFollowers');
      if (!allowed) return;

      await Notification.createUserNotification(
        targetUserId,
        'follow',
        'New Follower',
        `${follower.name} started following you.`,
        {
          priority:          'medium',
          actionUrl:         `/profile/${follower._id}`,
          sourceUserId:      follower._id,
          relatedEntityId:   follower._id,
          relatedEntityType: 'User',
          metadata: {
            followerId:   follower._id,
            followerName: follower.name,
            followerPic:  follower.profilePicture || null
          }
        }
      );
    } catch (err) {
      console.error('[UNS] onFollow error:', err.message);
    }
  }

  static async onUnfollow(unfollower, targetUserId) {
    try {
      if (unfollower._id.toString() === targetUserId.toString()) return;

      const allowed = await _checkNotifSetting(targetUserId, 'newFollowers');
      if (!allowed) return;

      await Notification.createUserNotification(
        targetUserId,
        'unfollow',
        'Follower Update',
        `${unfollower.name} unfollowed you.`,
        {
          priority: 'low',
          actionUrl: `/profile/${unfollower._id}`,
          sourceUserId: unfollower._id,
          relatedEntityId: unfollower._id,
          relatedEntityType: 'User',
          metadata: {
            unfollowerId: unfollower._id,
            unfollowerName: unfollower.name,
            unfollowerPic: unfollower.profilePicture || null
          }
        }
      );
    } catch (err) {
      console.error('[UNS] onUnfollow error:', err.message);
    }
  }

  static async onCircleNewThread(author, circle, thread) {
    try {
      const authorId = author._id.toString();

      // Build the list of members to notify (everyone except the author)
      const memberIds = (circle.members || [])
        .map(m => (m.userId || m.user || m).toString())
        .filter(id => id !== authorId);

      if (memberIds.length === 0) return;

      // Check notification preference for each member
      const prefResults = await Promise.allSettled(
        memberIds.map(id => _checkNotifSetting(id, 'circleAnnouncements'))
      );
      const allowedIds = memberIds.filter((_, i) => {
        const r = prefResults[i];
        return r.status === 'fulfilled' && r.value !== false;
      });

      if (allowedIds.length === 0) return;

      const notifications = allowedIds.map(memberId =>
        Notification.createUserNotification(
          memberId,
          'thread_create',
          `New post in ${circle.name}`,
          `${author.name} posted "${thread.title}" in ${circle.name}.`,
          {
            priority:          'low',
            actionUrl:         `/circles/${circle._id}/threads/${thread._id}`,
            sourceUserId:      author._id,
            relatedEntityId:   thread._id,
            relatedEntityType: 'Thread',
            metadata: {
              circleId:   circle._id,
              circleName: circle.name,
              threadId:   thread._id,
              threadTitle: thread.title,
              authorId:   author._id,
              authorName: author.name
            }
          }
        )
      );

      // Fire all in parallel — one DB write + one socket push per member
      await Promise.allSettled(notifications);
    } catch (err) {
      console.error('[UNS] onCircleNewThread error:', err.message);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. CIRCLE JOIN REQUEST
  //    Call this when a user requests to join a private/moderated circle.
  //    Notifies every moderator of that circle.
  //
  //    UNS.onCircleJoinRequest(requester, circle)
  //
  //    @param requester - full User document of the person requesting
  //    @param circle    - full Circle document (must have .moderators array of
  //                       userIds and ._id, .name)
  // ────────────────────────────────────────────────────────────────────────────
  static async onCircleJoinRequest(requester, circle) {
    try {
      // Always notify the creator + any promoted moderators (deduplicated)
      const rawIds = [
        circle.createdBy?.toString(),
        ...(circle.moderators || []).map(m => (m._id || m.userId || m).toString())
      ];
      const moderatorIds = [...new Set(rawIds.filter(Boolean))]
        .filter(id => id !== requester._id.toString());

      if (moderatorIds.length === 0) return;

      // Check preference for each moderator
      const prefResults = await Promise.allSettled(
        moderatorIds.map(id => _checkNotifSetting(id, 'circleAnnouncements'))
      );
      const allowedIds = moderatorIds.filter((_, i) => {
        const r = prefResults[i];
        return r.status === 'fulfilled' && r.value !== false;
      });

      if (allowedIds.length === 0) return;

      const notifications = allowedIds.map(modId =>
        Notification.createUserNotification(
          modId,
          'circle_request',
          'New Join Request',
          `${requester.name} wants to join "${circle.name}".`,
          {
            priority:          'high',
            actionUrl:         '/circle-requests',
            sourceUserId:      requester._id,
            relatedEntityId:   circle._id,
            relatedEntityType: 'Circle',
            metadata: {
              requesterId:   requester._id,
              requesterName: requester.name,
              requesterPic:  requester.profilePicture || null,
              circleId:      circle._id,
              circleName:    circle.name
            }
          }
        )
      );

      await Promise.allSettled(notifications);
    } catch (err) {
      console.error('[UNS] onCircleJoinRequest error:', err.message);
    }
  }

  static async onCircleAccepted(acceptedUserId, circle) {
    try {
      const allowed = await _checkNotifSetting(acceptedUserId, 'circleAnnouncements');
      if (!allowed) return;

      await Notification.createUserNotification(
        acceptedUserId,
        'circle_accept',
        'Join Request Approved! 🎉',
        `You have been accepted into "${circle.name}". Welcome!`,
        {
          priority:          'high',
          actionUrl:         `/circles/${circle._id}`,
          relatedEntityId:   circle._id,
          relatedEntityType: 'Circle',
          metadata: {
            circleId:   circle._id,
            circleName: circle.name
          }
        }
      );
    } catch (err) {
      console.error('[UNS] onCircleAccepted error:', err.message);
    }
  }

  static async onThreadLiked(liker, thread) {
    try {
      const authorId = (thread.author || thread.userId || thread.authorId || '').toString();
      if (!authorId || liker._id.toString() === authorId) return;

      const allowed = await _checkNotifSetting(authorId, 'discussionLikes');
      if (!allowed) return;

      await Notification.createUserNotification(
        authorId,
        'like',
        'Someone liked your post ❤️',
        `${liker.name} liked your thread "${thread.title}".`,
        {
          priority:          'low',
          actionUrl:         `/discussions/${thread._id}`,
          sourceUserId:      liker._id,
          relatedEntityId:   thread._id,
          relatedEntityType: 'Thread',
          metadata: {
            likerId:     liker._id,
            likerName:   liker.name,
            likerPic:    liker.profilePicture || null,
            threadId:    thread._id,
            threadTitle: thread.title
          }
        }
      );
    } catch (err) {
      console.error('[UNS] onThreadLiked error:', err.message);
    }
  }

  static async onThreadCommented(commenter, thread, commentPreview = '') {
    try {
      const authorId = (thread.author || thread.userId || thread.authorId || '').toString();
      if (!authorId || commenter._id.toString() === authorId) return;

      const allowed = await _checkNotifSetting(authorId, 'discussionComments');
      if (!allowed) return;

      const preview = commentPreview.length > 80
        ? commentPreview.substring(0, 77) + '…'
        : commentPreview;

      await Notification.createUserNotification(
        authorId,
        'comment',
        'New comment on your post 💭',
        preview
          ? `${commenter.name} commented: "${preview}"`
          : `${commenter.name} commented on your thread "${thread.title}".`,
        {
          priority:          'medium',
          actionUrl:         `/discussions/${thread._id}`,
          sourceUserId:      commenter._id,
          relatedEntityId:   thread._id,
          relatedEntityType: 'Thread',
          metadata: {
            commenterId:    commenter._id,
            commenterName:  commenter.name,
            commenterPic:   commenter.profilePicture || null,
            threadId:       thread._id,
            threadTitle:    thread.title,
            commentPreview: preview
          }
        }
      );
    } catch (err) {
      console.error('[UNS] onThreadCommented error:', err.message);
    }
  }

  static async onVoiceRoomStarted(host, room) {
    try {
      const hostUser = await (require('../models/User'))
        .findById(host._id)
        .select('followers');

      const followerIds = (hostUser?.followers || [])
        .map((id) => id.toString())
        .filter((id) => id !== host._id.toString());

      if (followerIds.length === 0) return;

      // Check room reminder preference for each follower
      const prefResults = await Promise.allSettled(
        followerIds.map(id => _checkNotifSetting(id, 'roomStartedAlerts'))
      );
      const allowedIds = followerIds.filter((_, i) => {
        const r = prefResults[i];
        return r.status === 'fulfilled' && r.value !== false;
      });

      if (allowedIds.length === 0) return;

      const notifications = allowedIds.map((followerId) =>
        Notification.createUserNotification(
          followerId,
          'voice_room_created',
          'Live Voice Room Started',
          `${host.name} started a live voice room: "${room.name}".`,
          {
            priority: 'medium',
            actionUrl: `/voice-rooms/${room._id}`,
            sourceUserId: host._id,
            relatedEntityId: room._id,
            relatedEntityType: 'ChatRoom',
            metadata: {
              roomId: room._id,
              roomName: room.name,
              hostId: host._id,
              hostName: host.name
            }
          }
        )
      );

      await Promise.allSettled(notifications);
    } catch (err) {
      console.error('[UNS] onVoiceRoomStarted error:', err.message);
    }
  }
}

UserNotificationService.invalidateCache = _invalidateUserCache;
module.exports = UserNotificationService;