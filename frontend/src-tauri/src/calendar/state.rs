use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{oneshot, RwLock};

pub struct CalendarState {
    pub poller_shutdown: std::sync::Mutex<Option<oneshot::Sender<()>>>,
    pub notified_event_ids: Arc<RwLock<HashSet<String>>>,
}

impl CalendarState {
    pub fn new() -> Self {
        Self {
            poller_shutdown: std::sync::Mutex::new(None),
            notified_event_ids: Arc::new(RwLock::new(HashSet::new())),
        }
    }
}
