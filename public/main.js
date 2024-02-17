async function initPage(page, endpoint, callback) {
  try {
    const res = await fetch(`/oauth/token`);
    if (!res.ok) throw "No access token";

    const info = {};
    info.accessToken = await res.text();

    initHeader(page);

    showEnvironmentInfo(endpoint);

    // Enable refresh time override for testing purposes
    let refreshTime = 30 * 60 * 1000;
    const urlParams = new URLSearchParams(window.location.search);
    const refreshTimeParam = urlParams.get('refreshTime');
    if (refreshTimeParam) {
      refreshTime = refreshTimeParam * 1000;
    }

    // Get a new token every 30 minutes
    setInterval(async () => {
        let res = await fetch(`/oauth/token?refresh=true`);
        if (res.ok) {
          info.accessToken = await res.text();
        } else {
          let res = await fetch("/oauth/url");
          const url = await res.text();
          location.href = url + `&state=${page}`;
        }
      }, refreshTime
    );
    
    callback(info);
  } catch (error) {
    const res = await fetch("/oauth/url");
    const url = await res.text();
    location.href = url + `&state=${page}`;
  }
}

async function initHeader(page) {
  let res = await fetch(`/userprofile`);

  if (res.ok) {
    const data = await res.json();
    console.log(data);
    const avatarImage = document.getElementById("avatarImage");
    avatarImage.src = data.picture;
    document.getElementById("userName").innerHTML = data.name;

    document.getElementById("signOut").onclick = async () => {
      logOut(page);
    };
  } else {
    let res = await fetch(`/oauth/token?refresh=true`);
    if (res.ok) {
      window.location.replace(page);
      return;
    }

    logOut(page);
  }
}

async function logOut(page) {
  // Log the user out (see https://aps.autodesk.com/blog/log-out-forge)
  const iframe = document.createElement("iframe");
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);
  iframe.onload = async () => {
    await new Promise(resolve => setTimeout(() => resolve(), 2000));
    window.location.replace(page);
    document.body.removeChild(iframe);
  };
  let res = await fetch("/logout");
  const url = await res.text();
  iframe.src = url;
}

function showEnvironmentInfo(endpoint) {
  if (endpoint !== "https://developer.api.autodesk.com/fusiondata/2022-04/graphql")
    document.getElementById("endpoint").innerHTML = endpoint;
}