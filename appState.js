// state.js
const AppState = {
  currentMonday: null,
  viewMode: 'week',
  monthAnchor: null,
  selectedApptId: null,

  init() {
    this.currentMonday = getMonday(new Date());
    this.monthAnchor = new Date();
    return this;
  }
};

// Make it globally available
window.AppState = AppState;