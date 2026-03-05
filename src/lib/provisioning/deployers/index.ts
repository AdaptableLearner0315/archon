/**
 * Deployers
 * Real infrastructure deployment modules
 */

export {
  deployLandingPage,
  getDeployedLandingUrl,
  type DeploymentProgress,
  type ProgressCallback,
  type DeployResult,
} from './landing-deployer';

export {
  executeScheduledPost,
  postToTwitter,
  postToLinkedIn,
  postToYouTube,
  postToTikTok,
  uploadYouTubeVideo,
  setupProfile,
  getConnectedPlatforms,
  postToAllPlatforms,
  type PostResult,
  type PostOptions,
  type VideoOptions,
  type ProfileSetupResult,
} from './social-deployer';
