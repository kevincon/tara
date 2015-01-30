if (Meteor.isClient) {
  var ListeningState = Object.freeze({
      NOT_LISTENING: 0,
      LISTENING: 1
  });

  Meteor.startup(function () {
    Session.setDefault("currentInstruction", 1); // indexed by 1
    Session.setDefault("recipe", null);
    Session.setDefault("lastHeard", "");

    Session.setDefault("listeningState", ListeningState.NOT_LISTENING);
    Session.setDefault("annyangNotSupported", true);
    Session.setDefault("microphoneDisabled", false);
    Session.setDefault("loading", false);

    GAnalytics.pageview();

    startAnnyang();
  });

  function showSpeechModal() { $("#myModal").modal("show"); }
  function hideSpeechModal() { $("#myModal").modal("hide"); Session.set("lastHeard", ""); }
  function isListening() { return Session.get("listeningState") == ListeningState.LISTENING; }
  function startListening() { Session.set("listeningState", ListeningState.LISTENING); }
  function startListeningAfterPrompt(prompt) {
    speak(prompt, ListeningState.LISTENING);
    showSpeechModal();
  }
  function stopListening() { Session.set("listeningState", ListeningState.NOT_LISTENING); }

  function startAnnyang() {
    if (annyang) {
      Session.set("annyangNotSupported", false);
      var commands = {
        'hey *name': function(name) {
          if (!isListening()) {
            startListeningAfterPrompt("Yes?");
          }
        },
        '*command': function(command) {
          if (isListening()) {
            console.debug("Setting lastHeard: " + command);
            Session.set("lastHeard", command);
            Meteor.call("getWitAccessToken", function(tokenError, accessToken) {
              console.log(tokenError);
              if (!tokenError) {
                var parameters = {"q": command,
                                  "access_token": accessToken};
                $.ajax({
                  url: 'https://api.wit.ai/message',
                  data: parameters,
                  dataType: 'jsonp',
                  method: 'GET',
                  success: function(response) {
                    handleWitResponse(response);
                    setTimeout(function() { hideSpeechModal(); }, 1200);
                  }
                });
              }
            });
          } else {
            console.log("Heard '" + command + "' while not listening...");
          }
        }
      };

      annyang.addCommands(commands);

      function microphoneDisabled() {
        Session.set("microphoneDisabled", true);
      }

      annyang.addCallback('errorPermissionBlocked', microphoneDisabled);
      annyang.addCallback('errorPermissionDenied', microphoneDisabled);

      annyang.start();
    } else {
      Session.set("annyangNotSupported", true);
    }
  }

  function handleWitResponse(json) {
    console.debug("Handling wit response: ", json);

    for (var i = 0; i < json.outcomes.length; i++) {
      var outcome = json.outcomes[i];
      var confidence = outcome.confidence;
      var intent = outcome.intent;  // eg. ingredient_query
      var entityType = "";
      var entityValue = "";

      for (entityName in outcome.entities) {  // eg. Ingredient
        var entityValueWrappers = outcome.entities[entityName];  // eg. [egg, flour] (usually just 1)
        var entityValues = [];
        for (var k = 0; k < entityValueWrappers.length; k++) {
          entityValues.push(entityValueWrappers[k].value);
        }

        if (entityType == "" && entityValue == "" && entityValues.length > 0) {
          entityType = entityName;
          entityValue = entityValues[0];
        }
        console.debug("Wit response (confidence: %f, intent: %s, entityType: %s, entityValue: %s",
                      confidence, intent, entityType, entityValue);
      }

      if (entityType == "" && entityValue == "") {
        console.log("No entities found.");
        speak("Sorry, I didn't understand that.", ListeningState.NOT_LISTENING);
      }

      switch (intent) {
        case "ingredient_query":
          selectIngredient(entityType, entityValue);
          break;
        case "instruction_navigation":
          selectInstruction(entityType, entityValue);
          break;
        default:
          console.debug("Unknown intent with high confidence");
          break;
      }
    }
  }

  function clearSelectedIngredients() {
    var recipe = Session.get("recipe");
    for (var i = 0; i < recipe.extendedIngredients.length; i++) {
      recipe.extendedIngredients[i].highlight = false;
    }
    Session.set("recipe", recipe);
  }

  function selectIngredient(unusedType, ingredient) {
    // Finds ingredient in the list of ingredients and selects it, setting
    // currentIngredient to its index.
    clearSelectedIngredients();
    var recipe = Session.get("recipe");
    var foundIngredient = false;
    for (var i = 0; i < recipe.extendedIngredients.length; i++) {
      if (recipe.extendedIngredients[i].name.indexOf(ingredient) != -1) {
        console.debug("Selected ingredient: ", recipe.extendedIngredients[i].originalString);
        recipe.extendedIngredients[i].highlight = true;
        speak(recipe.extendedIngredients[i].originalString, ListeningState.NOT_LISTENING);
        foundIngredient = true;
      }
    }

    if (!foundIngredient) {
      speak("Sorry, I didn't see " + ingredient + " in this recipe.", ListeningState.NOT_LISTENING);
    } else {
      Session.set("recipe", recipe);
    }
  }

  function selectInstruction(type, instruction) {
    var newInstruction = 0;
    var currentInstruction = Session.get("currentInstruction");

    if (type == "ordinal" || type == "number") { newInstruction = instruction; }
    else if (type == "relative_instruction_navigation") {
      switch (instruction) {
        case "previous": newInstruction = currentInstruction - 1; break;
        case "current": newInstruction = currentInstruction; break;
        case "next": newInstruction = currentInstruction + 1; break;
      }
    } else {
      console.error("Unknown instruction type");
    }

    selectAndSayInstruction(newInstruction);
  }

  function getInstructions() {
    var bigInstructionText = Session.get("recipe").text;
    return bigInstructionText.split(/\.\s/);
  }

  function selectAndSayInstruction(instruction) {
    console.debug("Selecting and saying instruction: ", instruction);
    var instructions = getInstructions();
    if (instruction >= 1 && instruction <= instructions.length) {
      Session.set("currentInstruction", instruction);
      speak(instructions[instruction - 1], ListeningState.NOT_LISTENING);
    } else {
      speak("Invalid instruction.", ListeningState.NOT_LISTENING);
    }
  }

  /*
  // For debug only:
  Meteor.call("getTestRecipe", function(error, result) {
    Session.set("recipe", result);
  });
  */

  Template.body.helpers({
    recipeExists: function() {
      return Session.get("recipe") !== null;
    },
    annyangNotSupported: function() {
      return Session.get("annyangNotSupported");
    },
    microphoneDisabled: function() {
      return Session.get("microphoneDisabled");
    },
    isLoading: function() {
      return Session.get("loading");
    }
  });

  Template.body.events = {
    'click .favorite': function(event, template) {
      var url = template.find(".recipeurl").value;
      loadRecipeUrl("http://www.foodnetwork.com/recipes/alton-brown/baked-macaroni-and-cheese-recipe.html");
    }
  };

  function loadRecipeUrl(url) {
    $('.recipeurl').attr("disabled", "disabled");
    Session.set("loading", true);

    if (!url || url.length === 0) {
      console.log("bad recipe url");
      return;
    }

    console.debug("Loading new recipe from URL: " + url);
    Meteor.call("getRecipe", url, function(error, result) {
      if (result === undefined || result === null) {
        console.debug("Result result is bad :(");
      } else {
        console.debug("Recipe result is good :)");
        Session.set("recipe", result);
        $(".recipeurl").val("");
      }
      Session.set("loading", false);
      $(".recipeurl").removeAttr("disabled");
    });
  }

  Template.recipeurl.events = {
    // If the enter key is pressed in the recipe URL input box, load the url.
    'keypress .recipeurl': function (event, template) {
      if (event.which === 13) {  // Enter key pressed
        console.log("enter pressed");
        var url = template.find(".recipeurl").value;
        console.log("url" + url);
        loadRecipeUrl(url);
      }
    }
  };

  Template.recognizedSpeech.helpers({
    recognizedSpeech: function() { return Session.get("lastHeard"); }
  });

  Template.title.helpers({
    title: function() {
      return Session.get("recipe").title;
    },
    image: function() {
      var recipe = Session.get("recipe");
      if (recipe) {
        var imageUrls = recipe.imageUrls;
        if (imageUrls.length > 0) {
          var url = imageUrls[0];
          if (url.indexOf("http") != -1) {
            return {"key": 0, "value": imageUrls[0]};
          } else {
            var imageCacheUrl = "https://webknox.com/recipeImages/"
            return {"key": 0, "value": imageCacheUrl + imageUrls[0]};
          }
        } else {
          // TODO return placeholder image instead of null
          return {"key": 0, "value": null};
        }
      } else {
        return {"key": 0, "value": null};
      }
    }
  });

  Template.ingredients.helpers({
    ingredients: function() {
      return Session.get("recipe").extendedIngredients;
    }
  });

  Template.ingredient.events({
    "click tr": function() {
      speak(this.originalString, Session.get("listeningState"));
    }
  });

  Template.registerHelper("arrayify", function(theArray, offset) {
    resultingArray = [];
    for (var i = 0; i < theArray.length; i++) {
      resultingArray.push({"key": i + offset, "value": theArray[i]});
    }
    return resultingArray;
  });

  Template.instructions.helpers({
    instructions: getInstructions
  });

  Template.instruction.helpers({
    isCurrentInstruction: function(key) {
      return key == Session.get("currentInstruction");
    }
  });

  Template.instruction.events({
    "click tr": function() {
      Session.set("currentInstruction", this.key);
      speak(this.value, Session.get("listeningState"));
    }
  });

  function speak(text, restoreState) {
    Meteor.call("getSpeechURL", text, function(error, result) {
      var speech = new buzz.sound(result);
      if (speech) {
        speech.bind("ended", function() {
          // When we're done speaking return our listening to its previous
          // state.
          Session.set("listeningState", restoreState);
        });
        for (var i in buzz.sounds) { buzz.sounds[i].stop(); }
        stopListening();
        speech.play();
      }
    });
  }
}

if (Meteor.isServer) {
  Meteor.methods({
    getTestRecipe: function() {
      return EJSON.parse(Assets.getText("recipe.json"));
    },
    getRecipe: function(recipeUrl) {
      //? this.unblock
      var endpoint = "https://webknox-recipes.p.mashape.com/recipes/extract";
      var params = {"url": recipeUrl};
      var headers = {"X-Mashape-Key": Meteor.settings.WEBKNOX_API_KEY,
                     "Accept": "application/json"};

      try {
        var result = Meteor.http.call("GET", endpoint, {params: params, headers: headers});
        return EJSON.parse(result.content);
      } catch (e) {
        console.log("Cannot get recipe from URL", e);
        return null;
      }
    },
    getSpeechURL: function(text) {
      var options = {"apikey": Meteor.settings.ISPEECH_API_KEY,
                     "action": "convert",
                     "voice": "ukenglishfemale",
                     "text": text};

      var speechURL = "https://api.ispeech.org/api/rest?";
      for (option in options) {
        speechURL += option + "=" + options[option] + "&";
      }
      return speechURL;
    },
    getWitAccessToken: function() {
      return Meteor.settings.WIT_ACCESS_TOKEN;
    }
  });
}
