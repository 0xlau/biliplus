class _UTILS {
  static getBvidFromUrl(url) {
    const match = /\/video\/([A-Za-z0-9]+)/.exec(url);
    if (match) {
      return match[1];
    }
    return null;
  }

  static findParentElement(element, func) {
    let _pe = element.parentElement;
    while (_pe != null) {
      if (func(_pe)) {
        return _pe;
      }
      _pe = _pe.parentElement;
    }
    if (_pe == null) {
      return null;
    }
  }
}
